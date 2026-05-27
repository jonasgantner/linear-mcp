import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const DEFAULT_COMMAND = '/Users/jonas/.agents/mcp/wrappers/linear.sh'
const WORKSPACE = argValue('--workspace') ?? 'jonas-test-workspace'
const command = argValue('--command') ?? DEFAULT_COMMAND
const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
const prefix = argValue('--prefix') ?? `MCP Lab ${runId}`
const reportPath = argValue('--report') ?? `/Users/jonas/.agents/mcp/servers/linear/reports/test-workspace-${runId}.md`

function argValue(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? null : process.argv[index + 1] ?? null
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const BLANK_PRONE_VIEW_PREF_VALUES = new Set([
  'noGrouping',
  'updatedAt',
  'createdAt',
  'ascending',
  'descending',
  'showAll',
  'showNone',
  'showLast30Days',
])

function assertNoBlankProneViewPreferences(name, preferences) {
  for (const [key, value] of Object.entries(preferences ?? {})) {
    if (BLANK_PRONE_VIEW_PREF_VALUES.has(value) || ((key === 'issueGrouping' || key === 'issueSubGrouping') && value === 'status')) {
      throw new Error(`${name} preference ${key}=${value} can render as a blank Linear UI dropdown`)
    }
  }
}

function assertNoBlankProneViewFilter(name, filter, path = []) {
  if (Array.isArray(filter)) {
    filter.forEach((item, index) => assertNoBlankProneViewFilter(name, item, [...path, String(index)]))
    return
  }
  if (!filter || typeof filter !== 'object') return

  for (const [key, value] of Object.entries(filter)) {
    const nextPath = [...path, key]
    const dotted = nextPath.join('.')
    if (key === 'team') {
      throw new Error(`${name} filter ${dotted} can render as a non-editable Linear UI filter; omit team scope or use top-level teamId only when intentional`)
    }
    if (dotted.endsWith('team.id.eq') || dotted.endsWith('state.type.eq') || dotted.endsWith('state.type.neq') || dotted.endsWith('status.type.eq') || dotted.endsWith('status.type.neq')) {
      throw new Error(`${name} filter ${dotted} can render incorrectly in the Linear UI; use id/type "in" arrays`)
    }
    assertNoBlankProneViewFilter(name, value, nextPath)
  }
}

function assertNoBlankProneProjectViewFilter(name, filter, path = []) {
  if (Array.isArray(filter)) {
    filter.forEach((item, index) => assertNoBlankProneProjectViewFilter(name, item, [...path, String(index)]))
    return
  }
  if (!filter || typeof filter !== 'object') return

  for (const [key, value] of Object.entries(filter)) {
    const nextPath = [...path, key]
    if (key === 'status') {
      throw new Error(`${name} projectFilterData.${nextPath.join('.')} can render as a one-status/type project filter that is hard to edit in Linear; omit it for GUI-friendly project views`)
    }
    assertNoBlankProneProjectViewFilter(name, value, nextPath)
  }
}

function stateTypeViewFilter(types) {
  return { state: { type: { in: types } } }
}

function nodeFrom(payload, path) {
  let value = payload
  for (const key of path) value = value?.[key]
  return value
}

function isoDate(daysFromNow) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + daysFromNow)
  return date.toISOString().slice(0, 10)
}

function isoDateTime(daysFromNow, hour = 9) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + daysFromNow)
  date.setUTCHours(hour, 0, 0, 0)
  return date.toISOString()
}

class McpClient {
  constructor(commandPath) {
    this.child = spawn(commandPath, [], { stdio: ['pipe', 'pipe', 'pipe'] })
    this.stdout = ''
    this.stderr = ''
    this.nextId = 1
    this.responses = new Map()

    this.child.stdout.on('data', chunk => {
      this.stdout += chunk.toString('utf8')
      let index
      while ((index = this.stdout.indexOf('\n')) !== -1) {
        const line = this.stdout.slice(0, index).trim()
        this.stdout = this.stdout.slice(index + 1)
        if (!line) continue
        const message = JSON.parse(line)
        if (message.id !== undefined && this.responses.has(message.id)) {
          this.responses.get(message.id)(message)
          this.responses.delete(message.id)
        }
      }
    })

    this.child.stderr.on('data', chunk => {
      this.stderr += chunk.toString('utf8')
    })

    this.child.on('exit', code => {
      if (code && this.responses.size) {
        for (const resolve of this.responses.values()) {
          resolve({ error: { code, message: this.stderr.trim() || `Process exited ${code}` } })
        }
      }
    })
  }

  send(message) {
    this.child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  request(method, params = {}) {
    const id = this.nextId++
    this.send({ jsonrpc: '2.0', id, method, params })
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), 45000)
      this.responses.set(id, value => {
        clearTimeout(timer)
        if (value.error) reject(new Error(`${method}: ${JSON.stringify(value.error)}`))
        else resolve(value.result)
      })
    })
  }

  async init() {
    const init = await this.request('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'linear-mcp-test-workspace-seeder', version: '0.1.0' },
    })
    this.send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })
    const tools = await this.request('tools/list')
    return {
      server: init.serverInfo?.name ?? null,
      protocolVersion: init.protocolVersion,
      toolCount: tools.tools?.length ?? 0,
      toolNames: (tools.tools ?? []).map(tool => tool.name),
    }
  }

  async call(name, args = {}, options = {}) {
    const result = await this.request('tools/call', { name, arguments: args })
    const text = (result.content ?? []).map(item => item.text ?? '').join('\n')
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    if (result.isError && !options.allowError) {
      throw new Error(`${name}: ${text}`)
    }
    return { name, isError: Boolean(result.isError), text, json }
  }

  async close() {
    this.child.stdin.end()
    this.child.kill('SIGTERM')
  }
}

const summary = {
  runId,
  workspace: WORKSPACE,
  prefix,
  server: null,
  checks: [],
  gaps: [],
  created: {},
  reportPath,
}

function remember(type, entity) {
  if (!entity?.id) return entity
  summary.created[type] ??= []
  summary.created[type].push({
    id: entity.id,
    identifier: entity.identifier,
    name: entity.name ?? entity.title,
    url: entity.url,
  })
  return entity
}

function pass(label, detail) {
  summary.checks.push({ label, status: 'ok', detail })
}

function gap(label, error, context = {}) {
  const message = error instanceof Error ? error.message : String(error)
  summary.checks.push({ label, status: 'gap', detail: message })
  summary.gaps.push({ label, message, ...context })
}

async function step(label, fn, options = {}) {
  try {
    const result = await fn()
    pass(label, options.detail ? options.detail(result) : undefined)
    return result
  } catch (err) {
    gap(label, err, options.context)
    if (options.required) throw err
    return null
  }
}

async function callJson(client, name, args = {}, options = {}) {
  const result = await client.call(name, { workspace: WORKSPACE, ...args }, options)
  if (result.isError && options.allowError) return result
  assert(result.json, `${name} did not return JSON`)
  return result.json
}

async function makeFixtureFiles() {
  const dir = join(tmpdir(), `linear-mcp-lab-${runId}`)
  await mkdir(dir, { recursive: true })
  const markdown = join(dir, 'lab-note.md')
  const json = join(dir, 'lab-data.json')
  const svg = join(dir, 'lab-image.svg')
  await writeFile(markdown, `# ${prefix}\n\nGenerated by Linear MCP test workspace seed.\n`, 'utf8')
  await writeFile(json, JSON.stringify({ prefix, runId, workspace: WORKSPACE }, null, 2), 'utf8')
  await writeFile(svg, `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" fill="#5e6ad2"/><text x="24" y="68" font-family="Arial" font-size="20" fill="white">${runId}</text></svg>\n`, 'utf8')
  return { dir, markdown, json, svg }
}

async function writeReport() {
  await mkdir(reportPath.slice(0, reportPath.lastIndexOf('/')), { recursive: true })
  const lines = [
    `# Linear MCP Test Workspace Audit ${runId}`,
    '',
    `Workspace: \`${WORKSPACE}\``,
    `Prefix: \`${prefix}\``,
    '',
    '## Result',
    '',
    `- Checks: ${summary.checks.filter(c => c.status === 'ok').length} passed`,
    `- Gaps/errors: ${summary.gaps.length}`,
    '',
    '## Created Durable Fixtures',
    '',
  ]
  for (const [type, items] of Object.entries(summary.created)) {
    lines.push(`### ${type}`, '')
    for (const item of items) {
      const label = item.identifier ? `${item.identifier} ${item.name ?? ''}`.trim() : item.name ?? item.id
      lines.push(`- ${label} (${item.id})${item.url ? ` - ${item.url}` : ''}`)
    }
    lines.push('')
  }
  lines.push('## Gaps', '')
  if (summary.gaps.length === 0) {
    lines.push('- None found in this run.', '')
  } else {
    for (const item of summary.gaps) {
      lines.push(`- ${item.label}: ${item.message}`)
    }
    lines.push('')
  }
  lines.push('## Checks', '')
  for (const check of summary.checks) {
    lines.push(`- [${check.status}] ${check.label}${check.detail ? ` - ${check.detail}` : ''}`)
  }
  await writeFile(reportPath, `${lines.join('\n')}\n`, 'utf8')
}

const client = new McpClient(command)
try {
  summary.server = await client.init()
  const files = await makeFixtureFiles()

  const viewer = await step('get_viewer', async () =>
    nodeFrom(await callJson(client, 'get_viewer'), ['viewer']), { required: true })

  const teamsData = await step('get_teams with states', async () =>
    await callJson(client, 'get_teams', { include: ['states'] }), { required: true })
  const team = teamsData.teams.nodes[0]
  assert(team, 'No team found')
  const states = team.states?.nodes ?? []
  const todoState = states.find(s => s.type === 'unstarted') ?? states.find(s => s.name === 'Todo')
  const startedState = states.find(s => s.type === 'started') ?? states.find(s => s.name === 'In Progress')
  const doneState = states.find(s => s.type === 'completed') ?? states.find(s => s.name === 'Done')
  const duplicateState = states.find(s => s.type === 'duplicate') ?? states.find(s => s.name === 'Duplicate')

  await step('update_team feature settings', async () =>
    nodeFrom(await callJson(client, 'update_team', {
      id: team.id,
      description: `${prefix} seeded team settings`,
      cyclesEnabled: true,
      cycleStartDay: 1,
      cycleDuration: 2,
      cycleCooldownTime: 0,
      cycleIssueAutoAssignStarted: true,
      cycleIssueAutoAssignCompleted: true,
      upcomingCycleCount: 2,
      issueEstimationType: 'fibonacci',
      issueEstimationExtended: true,
      issueEstimationAllowZero: true,
      defaultIssueEstimate: 1,
      triageEnabled: true,
      requirePriorityToLeaveTriage: false,
    }), ['teamUpdate', 'team']))

  const cycle = await step('create/update/list cycle', async () => {
    const created = nodeFrom(await callJson(client, 'create_cycle', {
      teamId: team.id,
      name: `${prefix} Cycle`,
      description: 'Cycle coverage fixture',
      startsAt: isoDateTime(7),
      endsAt: isoDateTime(21),
    }), ['cycleCreate', 'cycle'])
    remember('cycles', created)
    await callJson(client, 'update_cycle', { id: created.id, name: `${prefix} Cycle Updated` })
    await callJson(client, 'list_cycles', { teamId: team.id, first: 10 })
    return created
  })

  const projectStatus = await step('project status lifecycle', async () => {
    const created = nodeFrom(await callJson(client, 'create_project_status', {
      name: `MCP Risk ${runId.slice(-4)}`,
      color: '#e5484d',
      description: `${prefix} project status`,
      position: 9000,
      type: 'started',
    }), ['projectStatusCreate', 'status'])
    remember('projectStatuses', created)
    await callJson(client, 'update_project_status', { id: created.id, description: `${prefix} updated project status` })
    await callJson(client, 'get_project_status', { id: created.id })
    return created
  })

  const issueGroup = await step('issue label group', async () => {
    const group = nodeFrom(await callJson(client, 'create_issue_label', {
      name: `${prefix} Issue Group`,
      color: '#5e6ad2',
      description: 'MCP lab issue label group',
      isGroup: true,
    }), ['issueLabelCreate', 'issueLabel'])
    remember('issueLabels', group)
    return group
  }, { required: true })
  const issueLabel = await step('issue label child update/read', async () => {
    const label = nodeFrom(await callJson(client, 'create_issue_label', {
      name: `${prefix} Issue Label`,
      color: '#4cb782',
      description: 'MCP lab issue label',
      parentId: issueGroup.id,
    }), ['issueLabelCreate', 'issueLabel'])
    remember('issueLabels', label)
    await callJson(client, 'update_issue_label', { id: label.id, color: '#26b5ce', description: 'Updated by MCP lab' })
    await callJson(client, 'get_issue_label', { id: label.id })
    await callJson(client, 'list_labels', { filter: { name: { containsIgnoreCase: prefix } }, first: 20 })
    return label
  }, { required: true })

  const projectGroup = await step('project label group', async () => {
    const group = nodeFrom(await callJson(client, 'create_project_label', {
      name: `${prefix} Project Group`,
      color: '#5e6ad2',
      description: 'MCP lab project label group',
      isGroup: true,
    }), ['projectLabelCreate', 'projectLabel'])
    remember('projectLabels', group)
    return group
  }, { required: true })
  const projectLabel = await step('project label child update/read', async () => {
    const label = nodeFrom(await callJson(client, 'create_project_label', {
      name: `${prefix} Project Label`,
      color: '#f2c94c',
      description: 'MCP lab project label',
      parentId: projectGroup.id,
    }), ['projectLabelCreate', 'projectLabel'])
    remember('projectLabels', label)
    await callJson(client, 'update_project_label', { id: label.id, color: '#26b5ce', description: 'Updated by MCP lab' })
    await callJson(client, 'get_project_label', { id: label.id })
    await callJson(client, 'list_project_labels', { filter: { name: { containsIgnoreCase: prefix } }, first: 20 })
    return label
  }, { required: true })

  const projectA = await step('create primary project', async () => {
    const project = nodeFrom(await callJson(client, 'create_project', {
      name: `${prefix} Platform`,
      description: 'Primary project fixture',
      content: `# ${prefix} Platform\n\nProject rich content for MCP coverage.`,
      teamIds: [team.id],
      statusId: projectStatus?.id,
      state: projectStatus ? undefined : 'planned',
      icon: 'Briefcase',
      color: '#5e6ad2',
      priority: 2,
      startDate: isoDate(1),
      targetDate: isoDate(45),
      labelIds: [projectLabel.id],
    }), ['projectCreate', 'project'])
    remember('projects', project)
    await callJson(client, 'update_project', { id: project.id, icon: 'Rocket', color: '#26b5ce', priority: 1 })
    await callJson(client, 'get_project', { id: project.id })
    return project
  }, { required: true })

  const projectB = await step('create secondary project', async () => {
    const project = nodeFrom(await callJson(client, 'create_project', {
      name: `${prefix} Integrations`,
      description: 'Secondary project fixture',
      content: `# ${prefix} Integrations\n\nSecond project for movement/relation coverage.`,
      teamIds: [team.id],
      state: 'planned',
      icon: 'Briefcase',
      color: '#4cb782',
      priority: 3,
      startDate: isoDate(5),
      targetDate: isoDate(60),
    }), ['projectCreate', 'project'])
    remember('projects', project)
    await callJson(client, 'add_project_label', { id: project.id, labelId: projectLabel.id })
    await callJson(client, 'remove_project_label', { id: project.id, labelId: projectLabel.id })
    await callJson(client, 'add_project_label', { id: project.id, labelId: projectLabel.id })
    return project
  }, { required: true })

  const milestoneA = await step('create/update project milestone', async () => {
    const milestone = nodeFrom(await callJson(client, 'create_project_milestone', {
      projectId: projectA.id,
      name: `${prefix} Alpha`,
      description: 'Alpha milestone fixture',
      targetDate: isoDate(30),
      sortOrder: 100,
    }), ['projectMilestoneCreate', 'projectMilestone'])
    remember('projectMilestones', milestone)
    await callJson(client, 'update_project_milestone', { id: milestone.id, description: 'Updated alpha milestone', targetDate: isoDate(35) })
    return milestone
  }, { required: true })

  const milestoneB = await step('create second milestone', async () => {
    const milestone = nodeFrom(await callJson(client, 'create_project_milestone', {
      projectId: projectB.id,
      name: `${prefix} Beta`,
      description: 'Beta milestone fixture',
      targetDate: isoDate(50),
      sortOrder: 200,
    }), ['projectMilestoneCreate', 'projectMilestone'])
    remember('projectMilestones', milestone)
    return milestone
  }, { required: true })

  await step('project relation create/update/read', async () => {
    const relation = nodeFrom(await callJson(client, 'create_project_relation', {
      type: 'dependency',
      projectId: projectA.id,
      anchorType: 'end',
      relatedProjectId: projectB.id,
      relatedAnchorType: 'start',
    }), ['projectRelationCreate', 'projectRelation'])
    remember('projectRelations', relation)
    await callJson(client, 'update_project_relation', { id: relation.id, anchorType: 'milestone', projectMilestoneId: milestoneA.id })
    await callJson(client, 'get_project', { id: projectA.id })
    return relation
  })

  const projectUpdate = await step('project update lifecycle', async () => {
    const update = nodeFrom(await callJson(client, 'create_project_update', {
      projectId: projectA.id,
      body: `${prefix} project update body`,
      health: 'onTrack',
    }), ['projectUpdateCreate', 'projectUpdate'])
    remember('projectUpdates', update)
    await callJson(client, 'update_project_update', { id: update.id, body: `${prefix} project update edited`, health: 'atRisk' })
    return update
  })

  const initiative = await step('create/update initiative', async () => {
    const item = nodeFrom(await callJson(client, 'create_initiative', {
      name: `${prefix} Initiative`,
      description: 'Initiative fixture',
      content: `# ${prefix} Initiative\n\nInitiative rich content for MCP coverage.`,
      status: 'Planned',
      ownerId: viewer?.id,
      icon: 'MagicWand',
      color: '#5e6ad2',
      targetDate: isoDate(90),
      targetDateResolution: 'month',
    }), ['initiativeCreate', 'initiative'])
    remember('initiatives', item)
    await callJson(client, 'update_initiative', { id: item.id, status: 'Active', icon: 'Rocket', color: '#26b5ce' })
    await callJson(client, 'get_initiative', { id: item.id })
    return item
  }, { required: true })

  await step('initiative/project link lifecycle', async () => {
    await callJson(client, 'link_initiative_project', { initiativeId: initiative.id, projectId: projectA.id, sortOrder: 100 })
    await callJson(client, 'link_initiative_project', { initiativeId: initiative.id, projectId: projectB.id, sortOrder: 200 })
    await callJson(client, 'update_initiative_project_link', { initiativeId: initiative.id, projectId: projectB.id, sortOrder: 250 })
    await callJson(client, 'list_initiative_project_links', { initiativeId: initiative.id, first: 20 })
  })

  const initiativeUpdate = await step('initiative update lifecycle', async () => {
    const update = nodeFrom(await callJson(client, 'create_initiative_update', {
      initiativeId: initiative.id,
      body: `${prefix} initiative update body`,
      health: 'onTrack',
    }), ['initiativeUpdateCreate', 'initiativeUpdate'])
    remember('initiativeUpdates', update)
    await callJson(client, 'update_initiative_update', { id: update.id, body: `${prefix} initiative update edited`, health: 'atRisk' })
    return update
  })

  const parentIssue = await step('create parent issue', async () => {
    const issue = nodeFrom(await callJson(client, 'create_issue', {
      teamId: team.id,
      title: `${prefix} Parent issue`,
      description: `Parent issue body with inline anchor phrase ${runId}.`,
      priority: 2,
      stateId: startedState?.id ?? todoState?.id,
      assigneeId: viewer?.id,
      labelIds: [issueLabel.id],
      cycleId: cycle?.id,
      projectId: projectA.id,
      projectMilestoneId: milestoneA.id,
      estimate: 3,
      dueDate: isoDate(14),
    }), ['issueCreate', 'issue'])
    remember('issues', issue)
    return issue
  }, { required: true })

  const subIssue = await step('create sub-issue', async () => {
    const issue = nodeFrom(await callJson(client, 'create_issue', {
      teamId: team.id,
      title: `${prefix} Sub issue`,
      description: 'Sub-issue fixture',
      priority: 3,
      parentId: parentIssue.id,
      labelIds: [issueLabel.id],
      projectId: projectA.id,
      estimate: 1,
    }), ['issueCreate', 'issue'])
    remember('issues', issue)
    return issue
  })

  const blockerIssue = await step('create blocker issue', async () => {
    const issue = nodeFrom(await callJson(client, 'create_issue', {
      teamId: team.id,
      title: `${prefix} Blocker issue`,
      description: 'Blocks parent issue',
      priority: 1,
      projectId: projectA.id,
    }), ['issueCreate', 'issue'])
    remember('issues', issue)
    return issue
  })

  await step('issue relation create/read', async () => {
    const relation = nodeFrom(await callJson(client, 'create_issue_relation', {
      type: 'blocks',
      issueId: blockerIssue.id,
      relatedIssueId: parentIssue.id,
    }), ['issueRelationCreate', 'issueRelation'])
    remember('issueRelations', relation)
    await callJson(client, 'get_issue', { id: parentIssue.id })
    return relation
  })

  await step('issue update move/clear/read', async () => {
    await callJson(client, 'update_issue', {
      id: parentIssue.id,
      projectId: projectB.id,
      projectMilestoneId: milestoneB.id,
      dueDate: isoDate(21),
      estimate: 5,
    })
    await callJson(client, 'update_issue', { id: parentIssue.id, projectMilestoneId: null })
    return await callJson(client, 'get_issue', { id: parentIssue.id })
  })

  await step('issue reminder', async () =>
    await callJson(client, 'issue_reminder', { id: parentIssue.id, reminderAt: isoDateTime(2, 10) }))

  await step('issue batch create/update', async () => {
    const batch = nodeFrom(await callJson(client, 'issue_batch_create', {
      issues: [
        { teamId: team.id, title: `${prefix} Batch A`, projectId: projectA.id, labelIds: [issueLabel.id], priority: 4 },
        { teamId: team.id, title: `${prefix} Batch B`, projectId: projectA.id, labelIds: [issueLabel.id], priority: 4 },
      ],
    }), ['issueBatchCreate', 'issues'])
    for (const issue of batch ?? []) remember('issues', issue)
    await callJson(client, 'issue_batch_update', {
      ids: batch.map(issue => issue.id),
      projectId: projectB.id,
      projectMilestoneId: milestoneB.id,
      priority: 3,
    })
    return batch
  })

  await step('archive/unarchive issue', async () => {
    const issue = nodeFrom(await callJson(client, 'create_issue', {
      teamId: team.id,
      title: `${prefix} Archive roundtrip issue`,
      projectId: projectA.id,
    }), ['issueCreate', 'issue'])
    remember('issues', issue)
    await callJson(client, 'archive_issue', { id: issue.id })
    await callJson(client, 'unarchive_issue', { id: issue.id })
    return issue
  })

  await step('duplicate helper', async () => {
    const canonical = nodeFrom(await callJson(client, 'create_issue', {
      teamId: team.id,
      title: `${prefix} Canonical issue`,
      projectId: projectA.id,
    }), ['issueCreate', 'issue'])
    const duplicate = nodeFrom(await callJson(client, 'create_issue', {
      teamId: team.id,
      title: `${prefix} Duplicate issue`,
      projectId: projectA.id,
    }), ['issueCreate', 'issue'])
    remember('issues', canonical)
    remember('issues', duplicate)
    const result = await callJson(client, 'mark_issue_duplicate', {
      issueId: duplicate.id,
      duplicateOfIssueId: canonical.id,
      duplicateStateId: duplicateState?.id,
    })
    assert(result.success, result.error ?? 'mark_issue_duplicate did not report success')
    return result
  })

  const issueComment = await step('issue comments/update/thread/resolve', async () => {
    const comment = nodeFrom(await callJson(client, 'create_comment', {
      issueId: parentIssue.id,
      body: `${prefix} issue comment`,
    }), ['commentCreate', 'comment'])
    remember('comments', comment)
    await callJson(client, 'update_comment', { id: comment.id, body: `${prefix} issue comment edited` })
    await callJson(client, 'create_comment', { issueId: parentIssue.id, parentId: comment.id, body: `${prefix} threaded reply` })
    await callJson(client, 'resolve_comment', { id: comment.id })
    await callJson(client, 'unresolve_comment', { id: comment.id })
    return comment
  })

  await step('inline issue description comment', async () =>
    await callJson(client, 'create_comment', {
      issueDescriptionId: parentIssue.id,
      quotedText: `inline anchor phrase ${runId}`,
      body: `${prefix} inline issue description comment`,
    }))

  await step('project and initiative comments', async () => {
    const projectComment = nodeFrom(await callJson(client, 'create_comment', {
      projectId: projectA.id,
      body: `${prefix} project comment`,
    }), ['commentCreate', 'comment'])
    const initiativeComment = nodeFrom(await callJson(client, 'create_comment', {
      initiativeId: initiative.id,
      body: `${prefix} initiative comment`,
    }), ['commentCreate', 'comment'])
    remember('comments', projectComment)
    remember('comments', initiativeComment)
    return { projectComment, initiativeComment }
  })

  await step('reactions', async () => {
    const issueReaction = nodeFrom(await callJson(client, 'create_reaction', {
      issueId: parentIssue.id,
      emoji: 'rocket',
    }), ['reactionCreate', 'reaction'])
    remember('reactions', issueReaction)
    if (issueComment) {
      const commentReaction = nodeFrom(await callJson(client, 'create_reaction', {
        commentId: issueComment.id,
        emoji: 'heart',
      }), ['reactionCreate', 'reaction'])
      remember('reactions', commentReaction)
    }
    if (projectUpdate) {
      await callJson(client, 'create_reaction', { projectUpdateId: projectUpdate.id, emoji: '+1' })
    }
    if (initiativeUpdate) {
      await callJson(client, 'create_reaction', { initiativeUpdateId: initiativeUpdate.id, emoji: '+1' })
    }
    return issueReaction
  })

  const upload = await step('upload_file', async () => {
    const data = await callJson(client, 'upload_file', {
      path: files.markdown,
      makePublic: false,
      metaData: { runId, purpose: 'linear-mcp-lab' },
    })
    return data.upload
  })

  await step('file append tools', async () => {
    await callJson(client, 'append_issue_files', { issueId: parentIssue.id, paths: [files.markdown], heading: `${prefix} issue file` })
    await callJson(client, 'append_project_files', { projectId: projectA.id, paths: [files.json], heading: `${prefix} project file` })
    await callJson(client, 'append_initiative_files', { initiativeId: initiative.id, paths: [files.svg], heading: `${prefix} initiative file` })
  })

  await step('file comment/update/document tools', async () => {
    await callJson(client, 'create_comment_with_files', { issueId: parentIssue.id, body: `${prefix} comment file`, paths: [files.markdown] })
    if (projectUpdate) {
      await callJson(client, 'create_project_update_with_files', { projectId: projectA.id, body: `${prefix} project update file`, health: 'onTrack', paths: [files.json] })
    }
    if (initiativeUpdate) {
      await callJson(client, 'create_initiative_update_with_files', { initiativeId: initiative.id, body: `${prefix} initiative update file`, health: 'onTrack', paths: [files.svg] })
    }
  })

  await step('upload_image_from_url', async () =>
    await callJson(client, 'upload_image_from_url', {
      url: 'https://raw.githubusercontent.com/github/explore/main/topics/typescript/typescript.png',
    }))

  const document = await step('document lifecycle', async () => {
    const doc = nodeFrom(await callJson(client, 'create_document', {
      title: `${prefix} Project Document`,
      content: `# ${prefix} Document\n\nDocument body for MCP coverage.`,
      icon: 'Health',
      color: '#5e6ad2',
      projectId: projectA.id,
    }), ['documentCreate', 'document'])
    remember('documents', doc)
    await callJson(client, 'update_document', { id: doc.id, title: `${prefix} Project Document Updated`, color: '#26b5ce' })
    await callJson(client, 'get_document', { id: doc.id })
    await callJson(client, 'search_documents', { projectId: projectA.id, first: 20 })
    return doc
  })

  await step('document comments and files', async () => {
    const docWithFiles = nodeFrom(await callJson(client, 'create_document_with_files', {
      title: `${prefix} File Document`,
      content: 'Document with uploaded files.',
      paths: [files.markdown, files.json],
      icon: 'Health',
      color: '#4cb782',
      projectId: projectA.id,
    }), ['documentCreate', 'document'])
    remember('documents', docWithFiles)
    await callJson(client, 'update_document_with_files', { id: docWithFiles.id, content: 'Appending more files.', paths: [files.svg] })
    if (document) {
      const comment = nodeFrom(await callJson(client, 'create_comment', {
        documentId: document.id,
        body: `${prefix} document comment`,
      }), ['commentCreate', 'comment'])
      remember('comments', comment)
    }
  })

  await step('attachments lifecycle', async () => {
    const attachment = nodeFrom(await callJson(client, 'create_attachment', {
      issueId: parentIssue.id,
      title: `${prefix} Resource`,
      subtitle: 'MCP lab attachment',
      url: 'https://linear.app/docs',
      metadata: { runId, kind: 'docs' },
      commentBody: `${prefix} attachment comment`,
    }), ['attachmentCreate', 'attachment'])
    remember('attachments', attachment)
    await callJson(client, 'update_attachment', { id: attachment.id, title: `${prefix} Resource Updated`, metadata: { runId, updated: true } })
    const linked = nodeFrom(await callJson(client, 'link_attachment_url', {
      issueId: parentIssue.id,
      url: 'https://linear.app/changelog',
      title: `${prefix} Changelog`,
    }), ['attachmentLinkURL', 'attachment'])
    remember('attachments', linked)
    return attachment
  })

  const views = await step('view matrix issue/project display options', async () => {
    const createConfiguredView = async ({ name, icon, color, teamId, filterData, projectFilterData, preferences }) => {
      const created = nodeFrom(await callJson(client, 'create_view', {
        name: `${prefix} ${name}`,
        description: `${name} custom view fixture`,
        icon,
        color,
        shared: false,
        teamId,
        filterData,
        projectFilterData,
      }), ['customViewCreate', 'customView'])
      remember('views', created)

      const prefs = nodeFrom(await callJson(client, 'set_view_preferences', {
        customViewId: created.id,
        type: 'user',
        preferences,
      }), ['viewPreferencesCreate', 'viewPreferences'])
      assert(prefs.preferences, `${name} preferences did not read back`)
      assertNoBlankProneViewPreferences(name, prefs.preferences)

      const readback = nodeFrom(await callJson(client, 'get_view', { id: created.id }), ['customView'])
      assert(readback.icon === icon, `${name} icon did not read back`)
      assert(readback.color === color, `${name} color did not read back`)
      if (teamId) assert(readback.team?.id === teamId, `${name} team scope did not read back`)
      if (!teamId && filterData) assert(!readback.team, `${name} should be workspace-level when teamId is omitted`)
      assertNoBlankProneViewFilter(name, readback.filterData)
      assertNoBlankProneViewFilter(name, readback.projectFilterData)
      assertNoBlankProneProjectViewFilter(name, readback.projectFilterData)
      return created
    }

    const issueActiveList = await createConfiguredView({
      name: 'Issues Active List',
      icon: 'Health',
      color: '#5e6ad2',
      filterData: stateTypeViewFilter(['triage', 'backlog', 'unstarted', 'started']),
      preferences: {
        layout: 'list',
        issueGrouping: 'workflowState',
        issueSubGrouping: 'none',
        issueNesting: 'none',
        viewOrdering: 'priority',
        viewOrderingDirection: 'asc',
        showCompletedIssues: 'none',
        showSubIssues: true,
        showTriageIssues: false,
        showEmptyGroups: false,
        fieldAssignee: true,
        fieldStatus: true,
        fieldPriority: true,
        fieldProject: true,
        fieldDueDate: true,
        fieldLabels: true,
        fieldMilestone: true,
      },
    })

    const issuePriorityBoard = await createConfiguredView({
      name: 'Issues Priority Board',
      icon: 'Rocket',
      color: '#26b5ce',
      filterData: {},
      preferences: {
        layout: 'board',
        issueGrouping: 'priority',
        issueSubGrouping: 'none',
        issueNesting: 'none',
        viewOrdering: 'priority',
        viewOrderingDirection: 'desc',
        showCompletedIssues: 'none',
        showSubIssues: true,
        showTriageIssues: false,
        fieldAssignee: true,
        fieldStatus: true,
        fieldPriority: true,
        fieldProject: true,
      },
    })

    const issueAdvancedList = await createConfiguredView({
      name: 'Issues Advanced Filter',
      icon: 'Briefcase',
      color: '#4cb782',
      filterData: stateTypeViewFilter(['unstarted', 'started']),
      preferences: {
        layout: 'list',
        issueGrouping: 'none',
        issueSubGrouping: 'none',
        issueNesting: 'none',
        viewOrdering: 'dateCreated',
        viewOrderingDirection: 'desc',
        showCompletedIssues: 'none',
        showSubIssues: true,
        showTriageIssues: false,
        fieldAssignee: false,
        fieldStatus: true,
        fieldPriority: true,
        fieldProject: true,
        fieldLabels: true,
      },
    })

    const projectStatusList = await createConfiguredView({
      name: 'Projects Status List',
      icon: 'Briefcase',
      color: '#f2c94c',
      projectFilterData: {},
      preferences: {
        projectLayout: 'list',
        projectGrouping: 'status',
        projectViewOrdering: 'priority',
        viewOrderingDirection: 'asc',
        showCompletedProjects: 'none',
        projectFieldStatus: true,
        projectFieldPriority: true,
        projectFieldHealth: true,
        projectFieldLead: true,
        projectFieldMembers: true,
        projectFieldStartDate: true,
        projectFieldTargetDate: true,
        projectFieldMilestone: true,
      },
    })

    const projectTargetDates = await createConfiguredView({
      name: 'Projects Target Dates',
      icon: 'Rocket',
      color: '#e5484d',
      projectFilterData: {},
      preferences: {
        projectLayout: 'list',
        projectGrouping: 'none',
        projectViewOrdering: 'priority',
        viewOrderingDirection: 'desc',
        showCompletedProjects: 'all',
        projectFieldStatus: true,
        projectFieldHealth: true,
        projectFieldLead: true,
        projectFieldStartDate: true,
        projectFieldTargetDate: true,
      },
    })

    const projectStatusBoard = await createConfiguredView({
      name: 'Projects Status Board',
      icon: 'Health',
      color: '#bec2c8',
      projectFilterData: {},
      preferences: {
        projectLayout: 'board',
        projectGrouping: 'status',
        projectViewOrdering: 'status',
        viewOrderingDirection: 'asc',
        showCompletedProjects: 'all',
        projectFieldStatus: true,
        projectFieldHealth: true,
        projectFieldLead: true,
        projectFieldMembers: true,
      },
    })

    await callJson(client, 'list_views', { first: 50 })
    return { issueActiveList, issuePriorityBoard, issueAdvancedList, projectStatusList, projectTargetDates, projectStatusBoard }
  }, { required: true })

  await step('favorites folder/order/targets', async () => {
    const folder = nodeFrom(await callJson(client, 'create_favorite', {
      folderName: `${prefix} Favorites`,
      sortOrder: 9000,
    }), ['favoriteCreate', 'favorite'])
    remember('favorites', folder)
    const viewFav = nodeFrom(await callJson(client, 'create_favorite', {
      customViewId: views.issueActiveList.id,
      parentId: folder.id,
      sortOrder: 9001,
    }), ['favoriteCreate', 'favorite'])
    const projectViewFav = nodeFrom(await callJson(client, 'create_favorite', {
      customViewId: views.projectTargetDates.id,
      parentId: folder.id,
      sortOrder: 9002,
    }), ['favoriteCreate', 'favorite'])
    const projectFav = nodeFrom(await callJson(client, 'create_favorite', {
      projectId: projectA.id,
      parentId: folder.id,
      sortOrder: 9003,
    }), ['favoriteCreate', 'favorite'])
    remember('favorites', viewFav)
    remember('favorites', projectViewFav)
    remember('favorites', projectFav)
    await callJson(client, 'update_favorite', { id: projectFav.id, sortOrder: 9004 })
    await callJson(client, 'list_favorites', { first: 100 })
  })

  await step('templates issue/project/document/recurring', async () => {
    const issueTemplate = nodeFrom(await callJson(client, 'create_template', {
      name: `${prefix} Issue Template`,
      type: 'issue',
      teamId: team.id,
      description: 'Issue template fixture',
      icon: 'Health',
      color: '#5e6ad2',
      templateData: {
        title: `${prefix} Template Issue`,
        description: 'Issue generated from MCP template fixture.',
        priority: 3,
        teamId: team.id,
        labelIds: [issueLabel.id],
      },
    }), ['templateCreate', 'template'])
    remember('templates', issueTemplate)
    await callJson(client, 'update_template', { id: issueTemplate.id, description: 'Updated issue template fixture' })
    await callJson(client, 'get_template', { id: issueTemplate.id })
    await callJson(client, 'list_templates', { teamId: team.id })

    const recurringTemplate = nodeFrom(await callJson(client, 'create_template', {
      name: `${prefix} Recurring Template`,
      type: 'recurringIssue',
      teamId: team.id,
      description: 'Recurring issue template fixture',
      icon: 'Health',
      color: '#26b5ce',
      templateData: {
        title: `${prefix} Recurring Issue`,
        description: 'Recurring fixture with far-future start.',
        teamId: team.id,
        schedule: { interval: 1, type: 'weeks', startAt: isoDate(120) },
      },
    }), ['templateCreate', 'template'])
    remember('templates', recurringTemplate)
    return { issueTemplate, recurringTemplate }
  })

  await step('template unsupported type probes', async () => {
    const projectTemplate = await client.call('create_template', {
      workspace: WORKSPACE,
      name: `${prefix} Project Template Probe`,
      type: 'project',
      teamId: team.id,
      description: 'Project template probe',
      templateData: {
        name: `${prefix} Template Project`,
        teamIds: [team.id],
      },
    }, { allowError: true })
    if (projectTemplate.isError) throw new Error(projectTemplate.text)
    return projectTemplate.json
  }, { context: { note: 'templateData shapes may need separate documentation per type' } })

  await step('read/search/list surfaces', async () => {
    await callJson(client, 'search_issues', { query: prefix, first: 20 })
    await callJson(client, 'search_projects', { name: prefix, first: 20 })
    await callJson(client, 'list_initiatives', { first: 20 })
    await callJson(client, 'list_project_statuses', { first: 20 })
    await callJson(client, 'list_notifications', { first: 20, includeArchived: true })
  })

  if (doneState && subIssue) {
    await step('complete one issue', async () =>
      await callJson(client, 'update_issue', { id: subIssue.id, stateId: doneState.id }))
  }

  await writeReport()
} finally {
  await client.close()
}

console.log(JSON.stringify(summary, null, 2))
