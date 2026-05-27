import { spawn } from 'node:child_process'

const DEFAULT_COMMAND = '/Users/jonas/.agents/mcp/wrappers/linear.sh'
const WORKSPACE = argValue('--workspace') ?? 'jonas-test-workspace'
const FIXTURE_PREFIX = 'MCP Smoke'
const SANDBOX_NAME = 'Linear MCP Sandbox'

const scenarioArg = argValue('--scenario') ?? 'all'
const command = argValue('--command') ?? DEFAULT_COMMAND
const keepFixtures = process.argv.includes('--keep-fixtures')
const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)

const scenarioNames = scenarioArg === 'all'
  ? ['favorites', 'labels', 'duplicate', 'organize', 'comments', 'views', 'icons', 'notifications', 'subscriptions', 'templates']
  : scenarioArg.split(',').map(s => s.trim()).filter(Boolean)

function argValue(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? null : process.argv[index + 1] ?? null
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
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

function fixtureName(domain, suffix = '') {
  return `${FIXTURE_PREFIX} ${domain} ${runId}${suffix ? ` ${suffix}` : ''}`
}

function parseDiscordMessageUrl(url) {
  if (typeof url !== 'string') throw new Error('Discord URL is required')
  const match = url.match(/discord(?:app)?\.com\/channels\/([^/]+)\/([^/]+)\/([^/?#]+)/)
  if (!match) {
    throw new Error(`Invalid Discord message URL: ${url}`)
  }
  return { guildId: match[1], channelId: match[2], messageId: match[3], url }
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
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), 30000)
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
      clientInfo: { name: 'linear-mcp-live-smoke', version: '0.1.0' },
    })
    this.send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })
    const tools = await this.request('tools/list')
    return {
      server: init.serverInfo?.name ?? null,
      protocolVersion: init.protocolVersion,
      toolCount: tools.tools?.length ?? 0,
    }
  }

  async call(name, args = {}, options = {}) {
    const result = await this.request('tools/call', { name, arguments: args })
    const text = (result.content ?? []).map(item => item.text ?? '').join('\n')
    if (result.isError && !options.allowError) {
      throw new Error(`${name}: ${text}`)
    }
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    return { name, isError: Boolean(result.isError), text, json }
  }

  async close() {
    this.child.stdin.end()
    this.child.kill('SIGTERM')
  }
}

const cleanup = {
  attachments: [],
  favorites: [],
  views: [],
  milestones: [],
  issues: [],
  projects: [],
  initiatives: [],
  documents: [],
  templates: [],
  issueLabels: [],
  projectLabels: [],
  notifications: [],
}

const summary = {
  runId,
  workspace: WORKSPACE,
  scenario: scenarioArg,
  executed: [],
  warnings: [],
  cleanup: [],
}

function nodeFrom(payload, path) {
  let value = payload
  for (const key of path) value = value?.[key]
  return value
}

const CUSTOM_VIEW_READBACK_KEYS = [
  'id',
  'name',
  'description',
  'icon',
  'color',
  'shared',
  'modelName',
  'owner',
  'team',
  'facet',
  'projects',
  'initiatives',
  'filterData',
  'projectFilterData',
  'initiativeFilterData',
  'feedItemFilterData',
  'userViewPreferences',
  'organizationViewPreferences',
  'viewPreferencesValues',
  'createdAt',
  'updatedAt',
]

function sortForCompare(value) {
  if (Array.isArray(value)) return value.map(sortForCompare)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, sortForCompare(child)]),
  )
}

function canonicalJson(value) {
  return JSON.stringify(sortForCompare(value ?? null))
}

function assertCustomViewMutationMatchesGet(name, mutationView, readback) {
  assert(mutationView?.id && readback?.id, `${name} custom view readback missing id`)
  for (const key of CUSTOM_VIEW_READBACK_KEYS) {
    assert(Object.prototype.hasOwnProperty.call(mutationView, key), `${name} mutation response missing customView.${key}`)
    const actual = canonicalJson(mutationView[key])
    const expected = canonicalJson(readback[key])
    assert(actual === expected, `${name} mutation customView.${key} did not match get_view readback`)
  }
}

async function callJson(client, name, args = {}, options = {}) {
  const result = await client.call(name, args, options)
  if (!options.allowError) assert(result.json, `${name} did not return JSON`)
  return result
}

async function findActiveLabel(client, toolName, collectionName) {
  const data = (await callJson(client, toolName, {
    workspace: WORKSPACE,
    filter: { name: { eq: SANDBOX_NAME } },
    first: 50,
  })).json
  return data[collectionName].nodes.find(label => label.name === SANDBOX_NAME && !label.archivedAt && !label.retiredAt)
}

async function ensureSandbox(client) {
  const teams = (await callJson(client, 'get_teams', { workspace: WORKSPACE, include: ['states'] })).json
  const team = teams.teams.nodes.find(t => t.key === 'J') ?? teams.teams.nodes[0]
  assert(team, `No team found in ${WORKSPACE} workspace`)
  const states = team.states?.nodes ?? []
  const todoState = states.find(s => s.name === 'Todo' || s.type === 'unstarted')
  const duplicateState = states.find(s => s.type === 'duplicate' || s.name === 'Duplicate')

  const projects = (await callJson(client, 'search_projects', {
    workspace: WORKSPACE,
    name: SANDBOX_NAME,
    first: 20,
  })).json.projects.nodes
  let project = projects.find(p => p.name === SANDBOX_NAME && !p.archivedAt)
  if (!project) {
    project = nodeFrom((await callJson(client, 'create_project', {
      workspace: WORKSPACE,
      name: SANDBOX_NAME,
      teamIds: [team.id],
      state: 'planned',
      icon: 'Briefcase',
      color: '#5e6ad2',
      description: 'Durable sandbox for Linear MCP live smoke tests.',
    })).json, ['projectCreate', 'project'])
  }

  let issueLabel = await findActiveLabel(client, 'list_labels', 'issueLabels')
  if (!issueLabel) {
    try {
      issueLabel = nodeFrom((await callJson(client, 'create_issue_label', {
        workspace: WORKSPACE,
        name: SANDBOX_NAME,
        color: '#5e6ad2',
        description: 'Durable label for Linear MCP live smoke fixtures.',
      })).json, ['issueLabelCreate', 'issueLabel'])
    } catch (err) {
      if (!String(err?.message ?? err).includes('already exists')) throw err
      issueLabel = await findActiveLabel(client, 'list_labels', 'issueLabels')
      assert(issueLabel, `Issue label "${SANDBOX_NAME}" already exists but no active label could be read back`)
    }
  }

  let projectLabel = await findActiveLabel(client, 'list_project_labels', 'projectLabels')
  if (!projectLabel) {
    try {
      projectLabel = nodeFrom((await callJson(client, 'create_project_label', {
        workspace: WORKSPACE,
        name: SANDBOX_NAME,
        color: '#5e6ad2',
        description: 'Durable project label for Linear MCP live smoke fixtures.',
      })).json, ['projectLabelCreate', 'projectLabel'])
    } catch (err) {
      if (!String(err?.message ?? err).includes('already exists')) throw err
      projectLabel = await findActiveLabel(client, 'list_project_labels', 'projectLabels')
      assert(projectLabel, `Project label "${SANDBOX_NAME}" already exists but no active label could be read back`)
    }
  }

  return { team, todoState, duplicateState, project, issueLabel, projectLabel }
}

async function scanStaleFixtures(client) {
  const warnings = []
  const issues = (await callJson(client, 'search_issues', { workspace: WORKSPACE, query: FIXTURE_PREFIX, first: 50 })).json.issues.nodes
    .filter(issue => issue.title?.startsWith(FIXTURE_PREFIX))
  if (issues.length) warnings.push(`${issues.length} issue fixture(s) matched "${FIXTURE_PREFIX}"`)

  const projects = (await callJson(client, 'search_projects', { workspace: WORKSPACE, name: FIXTURE_PREFIX, first: 10 })).json.projects.nodes
  if (projects.length) warnings.push(`${projects.length} project fixture(s) matched "${FIXTURE_PREFIX}"`)

  const views = (await callJson(client, 'list_views', { workspace: WORKSPACE, first: 50 })).json.customViews.nodes
    .filter(view => view.name?.startsWith(FIXTURE_PREFIX))
  if (views.length) warnings.push(`${views.length} custom view fixture(s) matched "${FIXTURE_PREFIX}"`)

  const favorites = (await callJson(client, 'list_favorites', { workspace: WORKSPACE, first: 100 })).json.favorites.nodes
    .filter(fav => fav.title?.startsWith(FIXTURE_PREFIX) || fav.folderName?.startsWith(FIXTURE_PREFIX))
  if (favorites.length) warnings.push(`${favorites.length} favorite fixture(s) matched "${FIXTURE_PREFIX}"`)

  summary.warnings.push(...warnings)
}

async function createIssue(client, sandbox, domain, suffix = '') {
  const issue = nodeFrom((await callJson(client, 'create_issue', {
    workspace: WORKSPACE,
    teamId: sandbox.team.id,
    title: fixtureName(domain, suffix),
    projectId: sandbox.project.id,
    labelIds: [sandbox.issueLabel.id],
  })).json, ['issueCreate', 'issue'])
  cleanup.issues.push(issue.id)
  return issue
}

async function createProject(client, sandbox, domain, suffix = '') {
  const project = nodeFrom((await callJson(client, 'create_project', {
    workspace: WORKSPACE,
    name: fixtureName(domain, suffix),
    teamIds: [sandbox.team.id],
    state: 'planned',
    icon: 'Briefcase',
    color: '#5e6ad2',
  })).json, ['projectCreate', 'project'])
  cleanup.projects.push(project.id)
  return project
}

async function scenarioFavorites(client, sandbox) {
  const view = nodeFrom((await callJson(client, 'create_view', {
    workspace: WORKSPACE,
    name: fixtureName('favorites view'),
    icon: 'Health',
    color: '#5e6ad2',
    shared: false,
    filterData: { team: { id: { eq: sandbox.team.id } } },
  })).json, ['customViewCreate', 'customView'])
  cleanup.views.push(view.id)

  const folder = nodeFrom((await callJson(client, 'create_favorite', {
    workspace: WORKSPACE,
    folderName: fixtureName('favorites folder'),
    sortOrder: 9000,
  })).json, ['favoriteCreate', 'favorite'])
  cleanup.favorites.push(folder.id)

  const favorite = nodeFrom((await callJson(client, 'create_favorite', {
    workspace: WORKSPACE,
    customViewId: view.id,
    parentId: folder.id,
    sortOrder: 9001,
  })).json, ['favoriteCreate', 'favorite'])
  cleanup.favorites.push(favorite.id)
  assert(favorite.customView?.id === view.id, 'favorite customView readback mismatch')

  const updated = nodeFrom((await callJson(client, 'update_favorite', {
    workspace: WORKSPACE,
    id: favorite.id,
    sortOrder: 9002,
  })).json, ['favoriteUpdate', 'favorite'])
  if (updated.sortOrder !== 9002) {
    summary.warnings.push(`Favorite sortOrder update returned ${updated.sortOrder ?? 'null'} instead of 9002; Linear may normalize ordering asynchronously.`)
  }
}

async function scenarioLabels(client, sandbox) {
  const issueGroup = nodeFrom((await callJson(client, 'create_issue_label', {
    workspace: WORKSPACE,
    name: fixtureName('label issue group'),
    color: '#5e6ad2',
    isGroup: true,
  })).json, ['issueLabelCreate', 'issueLabel'])
  cleanup.issueLabels.push(issueGroup.id)
  const issueChild = nodeFrom((await callJson(client, 'create_issue_label', {
    workspace: WORKSPACE,
    name: fixtureName('label issue child'),
    color: '#5e6ad2',
    parentId: issueGroup.id,
  })).json, ['issueLabelCreate', 'issueLabel'])
  cleanup.issueLabels.push(issueChild.id)

  const updatedIssueLabel = nodeFrom((await callJson(client, 'update_issue_label', {
    workspace: WORKSPACE,
    id: issueChild.id,
    name: fixtureName('label issue child updated'),
    color: '#26b5ce',
  })).json, ['issueLabelUpdate', 'issueLabel'])
  assert(updatedIssueLabel.color === '#26b5ce', 'issue label update did not read back')

  await callJson(client, 'issue_label_retire', { workspace: WORKSPACE, id: issueChild.id })
  const retiredIssueLabel = nodeFrom((await callJson(client, 'get_issue_label', {
    workspace: WORKSPACE,
    id: issueChild.id,
  })).json, ['issueLabel'])
  assert(retiredIssueLabel.retiredAt, 'issue label retire did not set retiredAt')
  await callJson(client, 'issue_label_restore', { workspace: WORKSPACE, id: issueChild.id })

  const issue = await createIssue(client, sandbox, 'labels', 'issue')
  await callJson(client, 'update_issue', { workspace: WORKSPACE, id: issue.id, addedLabelIds: [issueChild.id] })
  await callJson(client, 'update_issue', { workspace: WORKSPACE, id: issue.id, removedLabelIds: [issueChild.id] })

  const projectGroup = nodeFrom((await callJson(client, 'create_project_label', {
    workspace: WORKSPACE,
    name: fixtureName('label project group'),
    color: '#5e6ad2',
    isGroup: true,
  })).json, ['projectLabelCreate', 'projectLabel'])
  cleanup.projectLabels.push(projectGroup.id)
  const projectChild = nodeFrom((await callJson(client, 'create_project_label', {
    workspace: WORKSPACE,
    name: fixtureName('label project child'),
    color: '#5e6ad2',
    parentId: projectGroup.id,
  })).json, ['projectLabelCreate', 'projectLabel'])
  cleanup.projectLabels.push(projectChild.id)

  const updatedProjectLabel = nodeFrom((await callJson(client, 'update_project_label', {
    workspace: WORKSPACE,
    id: projectChild.id,
    name: fixtureName('label project child updated'),
    color: '#26b5ce',
  })).json, ['projectLabelUpdate', 'projectLabel'])
  assert(updatedProjectLabel.color === '#26b5ce', 'project label update did not read back')

  await callJson(client, 'project_label_retire', { workspace: WORKSPACE, id: projectChild.id })
  const retiredProjectLabel = nodeFrom((await callJson(client, 'get_project_label', {
    workspace: WORKSPACE,
    id: projectChild.id,
  })).json, ['projectLabel'])
  assert(retiredProjectLabel.retiredAt, 'project label retire did not set retiredAt')
  await callJson(client, 'project_label_restore', { workspace: WORKSPACE, id: projectChild.id })

  const project = await createProject(client, sandbox, 'labels', 'project')
  await callJson(client, 'add_project_label', { workspace: WORKSPACE, id: project.id, labelId: projectChild.id })
  await callJson(client, 'remove_project_label', { workspace: WORKSPACE, id: project.id, labelId: projectChild.id })
}

async function scenarioDuplicate(client, sandbox) {
  assert(sandbox.duplicateState, 'Personal team has no Duplicate workflow state')
  const canonical = await createIssue(client, sandbox, 'duplicate', 'canonical')
  const duplicate = await createIssue(client, sandbox, 'duplicate', 'duplicate')

  const negative = await client.call('update_issue', {
    workspace: WORKSPACE,
    id: duplicate.id,
    stateId: sandbox.duplicateState.id,
  }, { allowError: true })
  summary.warnings.push(negative.isError
    ? 'Duplicate state without relation was rejected as expected.'
    : 'Duplicate state without relation succeeded; Linear may no longer require the relation precondition.')
  if (!negative.isError && sandbox.todoState) {
    await callJson(client, 'update_issue', { workspace: WORKSPACE, id: duplicate.id, stateId: sandbox.todoState.id })
  }

  const marked = (await callJson(client, 'mark_issue_duplicate', {
    workspace: WORKSPACE,
    issueId: duplicate.id,
    duplicateOfIssueId: canonical.id,
    duplicateStateId: sandbox.duplicateState.id,
  })).json
  assert(marked.success, 'mark_issue_duplicate reported failure')

  const readback = (await callJson(client, 'get_issue', { workspace: WORKSPACE, id: duplicate.id })).json.issue
  assert(readback.state.type === 'duplicate', 'duplicate issue did not move to Duplicate state')
  assert(readback.relations.nodes.some(relation => relation.type === 'duplicate' && relation.relatedIssue.id === canonical.id), 'duplicate relation readback missing')
}

async function scenarioOrganize(client, sandbox) {
  const viewer = (await callJson(client, 'get_viewer', { workspace: WORKSPACE })).json.viewer
  const cyclesResult = await client.call('list_cycles', {
    workspace: WORKSPACE,
    teamId: sandbox.team.id,
    type: 'current',
    first: 1,
  }, { allowError: true })
  const currentCycle = cyclesResult.isError ? null : cyclesResult.json?.cycles?.nodes?.[0] ?? null

  const sourceProject = await createProject(client, sandbox, 'organize', 'source')
  const targetProject = await createProject(client, sandbox, 'organize', 'target')
  const milestone = nodeFrom((await callJson(client, 'create_project_milestone', {
    workspace: WORKSPACE,
    projectId: targetProject.id,
    name: fixtureName('organize milestone'),
    targetDate: '2026-12-31',
  })).json, ['projectMilestoneCreate', 'projectMilestone'])
  cleanup.milestones.push(milestone.id)

  const issueA = await createIssue(client, sandbox, 'organize', 'single')
  const issueB = await createIssue(client, sandbox, 'organize', 'batch')
  await callJson(client, 'update_issue', { workspace: WORKSPACE, id: issueA.id, projectId: sourceProject.id })
  await callJson(client, 'update_issue', {
    workspace: WORKSPACE,
    id: issueA.id,
    projectId: targetProject.id,
    projectMilestoneId: milestone.id,
  })
  const moved = (await callJson(client, 'get_issue', { workspace: WORKSPACE, id: issueA.id })).json.issue
  assert(moved.project.id === targetProject.id, 'single issue project move did not read back')
  assert(moved.projectMilestone.id === milestone.id, 'single issue milestone move did not read back')

  const parent = await createIssue(client, sandbox, 'organize', 'parent')
  const createdWithFields = nodeFrom((await callJson(client, 'create_issue', {
    workspace: WORKSPACE,
    teamId: sandbox.team.id,
    title: fixtureName('organize create parity child'),
    projectId: targetProject.id,
    projectMilestoneId: milestone.id,
    assigneeId: viewer.id,
    parentId: parent.id,
    cycleId: currentCycle?.id,
    dueDate: isoDate(14),
    estimate: 3,
    labelIds: [sandbox.issueLabel.id],
  })).json, ['issueCreate', 'issue'])
  cleanup.issues.push(createdWithFields.id)
  assert(createdWithFields.project?.id === targetProject.id, 'create_issue projectId did not read back')
  assert(createdWithFields.projectMilestone?.id === milestone.id, 'create_issue projectMilestoneId did not read back')
  assert(createdWithFields.assignee?.id === viewer.id, 'create_issue assigneeId did not read back')
  assert(createdWithFields.parent?.id === parent.id, 'create_issue parentId did not read back')
  assert(createdWithFields.dueDate === isoDate(14), 'create_issue dueDate did not read back')
  assert(createdWithFields.estimate === 3, 'create_issue estimate did not read back')
  if (currentCycle) assert(createdWithFields.cycle?.id === currentCycle.id, 'create_issue cycleId did not read back')
  else summary.warnings.push('No current cycle found; cycle create/clear parity was skipped.')

  await callJson(client, 'update_issue', {
    workspace: WORKSPACE,
    id: createdWithFields.id,
    snoozedUntilAt: isoDateTime(7),
    snoozedById: viewer.id,
  })
  const snoozed = (await callJson(client, 'get_issue', { workspace: WORKSPACE, id: createdWithFields.id })).json.issue
  assert(snoozed.snoozedUntilAt, 'update_issue snoozedUntilAt did not read back')

  await callJson(client, 'update_issue', {
    workspace: WORKSPACE,
    id: createdWithFields.id,
    assigneeId: null,
    cycleId: currentCycle ? null : undefined,
    projectId: null,
    projectMilestoneId: null,
    parentId: null,
    dueDate: null,
    estimate: null,
    snoozedUntilAt: null,
  })
  const cleared = (await callJson(client, 'get_issue', { workspace: WORKSPACE, id: createdWithFields.id })).json.issue
  assert(!cleared.assignee, 'assigneeId null did not clear assignee')
  assert(!cleared.project, 'projectId null did not clear project')
  assert(!cleared.projectMilestone, 'projectMilestoneId null did not clear milestone')
  assert(!cleared.parent, 'parentId null did not clear parent')
  assert(cleared.dueDate === null, 'dueDate null did not clear due date')
  assert(cleared.estimate === null, 'estimate null did not clear estimate')
  assert(cleared.snoozedUntilAt === null, 'snoozedUntilAt null did not unsnooze issue')
  if (currentCycle) assert(!cleared.cycle, 'cycleId null did not clear cycle')

  await callJson(client, 'issue_batch_update', {
    workspace: WORKSPACE,
    ids: [issueB.id],
    projectId: targetProject.id,
    projectMilestoneId: milestone.id,
  })
  const batchMoved = (await callJson(client, 'get_issue', { workspace: WORKSPACE, id: issueB.id })).json.issue
  assert(batchMoved.project.id === targetProject.id, 'batch issue project move did not read back')
  assert(batchMoved.projectMilestone.id === milestone.id, 'batch issue milestone move did not read back')

  await callJson(client, 'issue_batch_update', {
    workspace: WORKSPACE,
    ids: [issueB.id],
    projectMilestoneId: null,
    dueDate: null,
  })
  const batchCleared = (await callJson(client, 'get_issue', { workspace: WORKSPACE, id: issueB.id })).json.issue
  assert(!batchCleared.projectMilestone, 'batch projectMilestoneId null did not clear milestone')

  const invalidBatch = await client.call('issue_batch_update', {
    workspace: WORKSPACE,
    ids: [issueB.id, '00000000-0000-0000-0000-000000000000'],
    projectId: sourceProject.id,
  }, { allowError: true })
  summary.warnings.push(invalidBatch.isError ? 'Batch update with an invalid UUID failed as one operation.' : 'Batch update with an invalid UUID did not fail.')
}

async function scenarioComments(client, sandbox) {
  await callJson(client, 'check_comment_schema_drift', { workspace: WORKSPACE })

  const issueQuote = `inline issue quote ${runId}`
  const issue = nodeFrom((await callJson(client, 'create_issue', {
    workspace: WORKSPACE,
    teamId: sandbox.team.id,
    title: fixtureName('comments issue'),
    description: `Comment readback fixture with ${issueQuote}.`,
    projectId: sandbox.project.id,
    labelIds: [sandbox.issueLabel.id],
  })).json, ['issueCreate', 'issue'])
  cleanup.issues.push(issue.id)

  const issueComment = nodeFrom((await callJson(client, 'create_comment', {
    workspace: WORKSPACE,
    issueId: issue.id,
    body: fixtureName('comments issue comment'),
  })).json, ['commentCreate', 'comment'])
  const issueReply = nodeFrom((await callJson(client, 'create_comment', {
    workspace: WORKSPACE,
    issueId: issue.id,
    parentId: issueComment.id,
    body: fixtureName('comments issue reply'),
  })).json, ['commentCreate', 'comment'])

  const issueInline = nodeFrom((await callJson(client, 'create_comment', {
    workspace: WORKSPACE,
    issueDescriptionId: issue.id,
    quotedText: issueQuote,
    body: fixtureName('comments issue inline'),
  })).json, ['commentCreate', 'comment'])
  const issueInlineReply = nodeFrom((await callJson(client, 'create_comment', {
    workspace: WORKSPACE,
    issueDescriptionId: issue.id,
    parentId: issueInline.id,
    body: fixtureName('comments issue inline reply'),
  })).json, ['commentCreate', 'comment'])
  await callJson(client, 'resolve_comment', { workspace: WORKSPACE, id: issueInline.id })

  const issueInlineRead = (await callJson(client, 'get_comment', {
    workspace: WORKSPACE,
    id: issueInline.id,
  })).json.comment
  assert(issueInlineRead.resolvedAt, 'get_comment did not include resolvedAt for issue inline comment')
  assert(issueInlineRead.resolvingUser?.id, 'get_comment did not include resolvingUser for issue inline comment')
  assert(issueInlineRead.children.nodes.some(comment => comment.id === issueInlineReply.id), 'get_comment did not include issue inline child reply')

  const issueComments = (await callJson(client, 'list_comments', {
    workspace: WORKSPACE,
    issueId: issue.id,
    first: 25,
  })).json.comments.nodes
  assert(issueComments.some(comment => comment.id === issueComment.id), 'list_comments issueId did not include normal issue comment')
  assert(issueComments.some(comment => comment.id === issueReply.id || comment.children.nodes.some(child => child.id === issueReply.id)), 'list_comments issueId did not include issue reply')

  const issueInlineComments = (await callJson(client, 'list_comments', {
    workspace: WORKSPACE,
    issueDescriptionId: issue.id,
    first: 25,
  })).json.comments.nodes
  assert(issueInlineComments.some(comment => comment.id === issueInline.id), 'list_comments issueDescriptionId did not include inline issue comment')

  const issueReplies = (await callJson(client, 'list_comments', {
    workspace: WORKSPACE,
    parentId: issueInline.id,
    first: 25,
  })).json.comments.nodes
  assert(issueReplies.some(comment => comment.id === issueInlineReply.id), 'list_comments parentId did not include issue inline reply')

  const issueReadback = (await callJson(client, 'get_issue', { workspace: WORKSPACE, id: issue.id })).json.issue
  const issueContentComment = issueReadback.documentContentComments.nodes.find(comment => comment.id === issueInline.id)
  assert(issueContentComment?.resolvingUser?.id, 'get_issue documentContentComments omitted resolvingUser')
  assert(issueContentComment.children.nodes.some(comment => comment.id === issueInlineReply.id), 'get_issue documentContentComments omitted child replies')

  const documentQuote = `inline document quote ${runId}`
  const document = nodeFrom((await callJson(client, 'create_document', {
    workspace: WORKSPACE,
    teamId: sandbox.team.id,
    title: fixtureName('comments document'),
    content: `Document comment readback fixture with ${documentQuote}.`,
    icon: 'Health',
    color: '#5e6ad2',
  })).json, ['documentCreate', 'document'])
  cleanup.documents.push(document.id)

  const documentInline = nodeFrom((await callJson(client, 'create_comment', {
    workspace: WORKSPACE,
    documentId: document.id,
    quotedText: documentQuote,
    body: fixtureName('comments document inline'),
  })).json, ['commentCreate', 'comment'])
  const documentReply = nodeFrom((await callJson(client, 'create_comment', {
    workspace: WORKSPACE,
    documentId: document.id,
    parentId: documentInline.id,
    body: fixtureName('comments document reply'),
  })).json, ['commentCreate', 'comment'])
  await callJson(client, 'resolve_comment', { workspace: WORKSPACE, id: documentInline.id })

  const documentInlineRead = (await callJson(client, 'get_comment', {
    workspace: WORKSPACE,
    id: documentInline.id,
  })).json.comment
  assert(documentInlineRead.resolvedAt, 'get_comment did not include resolvedAt for document inline comment')
  assert(documentInlineRead.resolvingUser?.id, 'get_comment did not include resolvingUser for document inline comment')
  assert(documentInlineRead.children.nodes.some(comment => comment.id === documentReply.id), 'get_comment did not include document child reply')

  const documentComments = (await callJson(client, 'list_comments', {
    workspace: WORKSPACE,
    documentId: document.id,
    first: 25,
  })).json.comments.nodes
  assert(documentComments.some(comment => comment.id === documentInline.id), 'list_comments documentId did not include document comment')

  const documentReadback = (await callJson(client, 'get_document', { workspace: WORKSPACE, id: document.id })).json.document
  const documentContentComment = documentReadback.comments.nodes.find(comment => comment.id === documentInline.id)
  assert(documentContentComment?.resolvingUser?.id, 'get_document comments omitted resolvingUser')
  assert(documentContentComment.children.nodes.some(comment => comment.id === documentReply.id), 'get_document comments omitted child replies')
}

async function scenarioViews(client, sandbox) {
  const scopedProject = await createProject(client, sandbox, 'views', 'scope project')
  const scopedInitiative = nodeFrom((await callJson(client, 'create_initiative', {
    workspace: WORKSPACE,
    name: fixtureName('views initiative scope'),
    status: 'Planned',
    icon: 'MagicWand',
    color: '#26b5ce',
  })).json, ['initiativeCreate', 'initiative'])
  cleanup.initiatives.push(scopedInitiative.id)

  const view = nodeFrom((await callJson(client, 'create_view', {
    workspace: WORKSPACE,
    name: fixtureName('views'),
    description: 'Initial issue custom view fixture',
    icon: 'Health',
    color: '#5e6ad2',
    shared: false,
    filterData: stateTypeViewFilter(['triage', 'backlog', 'unstarted', 'started']),
  })).json, ['customViewCreate', 'customView'])
  cleanup.views.push(view.id)
  const createReadback = (await callJson(client, 'get_view', { workspace: WORKSPACE, id: view.id })).json.customView
  assertCustomViewMutationMatchesGet('create_view', view, createReadback)

  const updated = nodeFrom((await callJson(client, 'update_view', {
    workspace: WORKSPACE,
    id: view.id,
    name: fixtureName('views updated'),
    description: 'Updated issue custom view fixture',
    icon: 'Health',
    color: '#26b5ce',
    shared: true,
    filterData: {},
  })).json, ['customViewUpdate', 'customView'])
  assert(updated.icon === 'Health' && updated.color === '#26b5ce', 'view icon/color update did not read back')
  assert(updated.name === fixtureName('views updated'), 'view name update did not read back')
  assert(updated.description === 'Updated issue custom view fixture', 'view description update did not read back')
  assert(updated.shared === true, 'view shared flag update did not read back')
  const updateReadback = (await callJson(client, 'get_view', { workspace: WORKSPACE, id: view.id })).json.customView
  assertCustomViewMutationMatchesGet('update_view', updated, updateReadback)

  const prefs = nodeFrom((await callJson(client, 'set_view_preferences', {
    workspace: WORKSPACE,
    customViewId: view.id,
    type: 'user',
    preferences: {
      layout: 'list',
      issueGrouping: 'none',
      issueSubGrouping: 'none',
      issueNesting: 'none',
      viewOrdering: 'priority',
      viewOrderingDirection: 'asc',
      showCompletedIssues: 'none',
      showSubIssues: true,
      showTriageIssues: false,
      fieldAssignee: false,
      fieldStatus: true,
      fieldPriority: true,
      fieldProject: true,
      fieldDueDate: true,
      fieldLabels: true,
      fieldMilestone: true,
    },
  })).json, ['viewPreferencesCreate', 'viewPreferences'])
  assert(prefs.preferences.layout === 'list', 'view preferences layout did not read back')
  assert(prefs.preferences.issueGrouping === 'none', 'view preferences issueGrouping did not read back')
  assert(prefs.preferences.viewOrderingDirection === 'asc', 'view preferences direction did not read back')
  assertNoBlankProneViewPreferences('views scenario', prefs.preferences)

  const readback = (await callJson(client, 'get_view', { workspace: WORKSPACE, id: view.id })).json.customView
  assert(readback.icon === 'Health' && readback.color === '#26b5ce', 'get_view icon/color readback mismatch')
  assert(!readback.team, 'get_view should be workspace-level when teamId is omitted')
  assertNoBlankProneViewFilter('views scenario', readback.filterData)

  const teamScoped = nodeFrom((await callJson(client, 'create_view', {
    workspace: WORKSPACE,
    name: fixtureName('views team scope'),
    description: 'Team-scoped issue custom view fixture',
    icon: 'Health',
    color: '#5e6ad2',
    teamId: sandbox.team.id,
    shared: false,
    filterData: stateTypeViewFilter(['unstarted', 'started']),
  })).json, ['customViewCreate', 'customView'])
  cleanup.views.push(teamScoped.id)
  assert(teamScoped.team?.id === sandbox.team.id, 'team-scoped view did not read back team scope')
  assertNoBlankProneViewFilter('team-scoped views scenario', teamScoped.filterData)

  const projectScoped = nodeFrom((await callJson(client, 'create_view', {
    workspace: WORKSPACE,
    name: fixtureName('views project scope'),
    description: 'Project-scoped issue custom view fixture',
    icon: 'Briefcase',
    color: '#4cb782',
    projectId: scopedProject.id,
    shared: false,
    filterData: stateTypeViewFilter(['unstarted', 'started']),
  })).json, ['customViewCreate', 'customView'])
  cleanup.views.push(projectScoped.id)
  if (projectScoped.facet?.sourceProject?.id !== scopedProject.id) {
    summary.warnings.push('CustomView projectId was accepted by public GraphQL but did not create a project facet.')
  }

  const initiativeScoped = nodeFrom((await callJson(client, 'create_view', {
    workspace: WORKSPACE,
    name: fixtureName('views initiative scope'),
    description: 'Initiative-scoped issue custom view fixture',
    icon: 'Health',
    color: '#26b5ce',
    initiativeId: scopedInitiative.id,
    shared: false,
    filterData: stateTypeViewFilter(['unstarted', 'started']),
  })).json, ['customViewCreate', 'customView'])
  cleanup.views.push(initiativeScoped.id)
  if (initiativeScoped.facet?.sourceInitiative?.id !== scopedInitiative.id) {
    summary.warnings.push('CustomView initiativeId was accepted by public GraphQL but did not create an initiative facet.')
  }

  const normalizedView = nodeFrom((await callJson(client, 'create_view', {
    workspace: WORKSPACE,
    name: fixtureName('views legacy filter'),
    icon: 'Briefcase',
    color: '#4cb782',
    shared: false,
    filterData: {
      and: [
        { team: { id: { eq: sandbox.team.id } } },
        {
          or: [
            { state: { type: { eq: 'unstarted' } } },
            { state: { type: { eq: 'started' } } },
          ],
        },
      ],
    },
  })).json, ['customViewCreate', 'customView'])
  cleanup.views.push(normalizedView.id)
  const normalizedReadback = (await callJson(client, 'get_view', { workspace: WORKSPACE, id: normalizedView.id })).json.customView
  assert(!normalizedReadback.team, 'legacy team filter should be stripped, not converted to team scope')
  assert(!normalizedReadback.filterData?.team, 'legacy team filter remained in filterData')
  assert(normalizedReadback.filterData?.state?.type?.in?.length === 2, 'legacy state OR filter was not normalized to state.type.in')
  assertNoBlankProneViewFilter('legacy views scenario', normalizedReadback.filterData)

  const feedView = nodeFrom((await callJson(client, 'create_view', {
    workspace: WORKSPACE,
    name: fixtureName('feed views'),
    description: 'Feed/update custom view fixture',
    icon: 'Health',
    color: '#5e6ad2',
    shared: false,
    feedItemFilterData: { relatedTeams: { id: { in: [sandbox.team.id] } } },
  })).json, ['customViewCreate', 'customView'])
  cleanup.views.push(feedView.id)
  assert(feedView.feedItemFilterData?.relatedTeams?.id?.in?.includes(sandbox.team.id), 'feed view filter did not read back relatedTeams filter')

  const initiativeView = nodeFrom((await callJson(client, 'create_view', {
    workspace: WORKSPACE,
    name: fixtureName('initiative views'),
    description: 'Initiative custom view fixture',
    icon: 'Health',
    color: '#26b5ce',
    shared: false,
    initiativeFilterData: { teams: { id: { in: [sandbox.team.id] } } },
  })).json, ['customViewCreate', 'customView'])
  cleanup.views.push(initiativeView.id)
  assert(initiativeView.initiativeFilterData?.teams?.id?.in?.includes(sandbox.team.id), 'initiative view filter did not read back team filter')

  const projectView = nodeFrom((await callJson(client, 'create_view', {
    workspace: WORKSPACE,
    name: fixtureName('project views'),
    icon: 'Briefcase',
    color: '#f2c94c',
    shared: false,
    projectFilterData: {},
  })).json, ['customViewCreate', 'customView'])
  cleanup.views.push(projectView.id)

  const projectPrefs = nodeFrom((await callJson(client, 'set_view_preferences', {
    workspace: WORKSPACE,
    customViewId: projectView.id,
    type: 'user',
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
      projectFieldStartDate: true,
      projectFieldTargetDate: true,
    },
  })).json, ['viewPreferencesCreate', 'viewPreferences'])
  assert(projectPrefs.preferences.projectLayout === 'list', 'project view preferences layout did not read back')
  assert(projectPrefs.preferences.projectGrouping === 'status', 'project view grouping did not read back')
  assertNoBlankProneViewPreferences('project views scenario', projectPrefs.preferences)

  const projectReadback = (await callJson(client, 'get_view', { workspace: WORKSPACE, id: projectView.id })).json.customView
  assert(projectReadback.projectFilterData && Object.keys(projectReadback.projectFilterData).length === 0, 'project view should not have project status filter data')
  assertNoBlankProneViewFilter('project views scenario', projectReadback.projectFilterData)
  assertNoBlankProneProjectViewFilter('project views scenario', projectReadback.projectFilterData)

  const normalizedProjectView = nodeFrom((await callJson(client, 'create_view', {
    workspace: WORKSPACE,
    name: fixtureName('project views legacy status filter'),
    icon: 'Briefcase',
    color: '#f2c94c',
    shared: false,
    projectFilterData: { status: { id: { in: ['00000000-0000-0000-0000-000000000000'] } } },
  })).json, ['customViewCreate', 'customView'])
  cleanup.views.push(normalizedProjectView.id)
  const normalizedProjectReadback = (await callJson(client, 'get_view', { workspace: WORKSPACE, id: normalizedProjectView.id })).json.customView
  assert(normalizedProjectReadback.projectFilterData && Object.keys(normalizedProjectReadback.projectFilterData).length === 0, 'project status filter was not stripped from projectFilterData')
  assertNoBlankProneProjectViewFilter('legacy project views scenario', normalizedProjectReadback.projectFilterData)
}

async function scenarioIcons(client, sandbox) {
  const project = await createProject(client, sandbox, 'icons', 'project')
  await callJson(client, 'update_project', {
    workspace: WORKSPACE,
    id: project.id,
    icon: 'Rocket',
    color: '#26b5ce',
  })
  const projectReadback = (await callJson(client, 'get_project', { workspace: WORKSPACE, id: project.id })).json.project
  assert(projectReadback.icon === 'Rocket' && projectReadback.color === '#26b5ce', 'project icon/color readback mismatch')

  const initiative = nodeFrom((await callJson(client, 'create_initiative', {
    workspace: WORKSPACE,
    name: fixtureName('icons initiative'),
    status: 'Planned',
    icon: 'MagicWand',
    color: '#5e6ad2',
  })).json, ['initiativeCreate', 'initiative'])
  cleanup.initiatives.push(initiative.id)
  await callJson(client, 'update_initiative', {
    workspace: WORKSPACE,
    id: initiative.id,
    icon: 'Rocket',
    color: '#26b5ce',
  })
  const initiativeReadback = (await callJson(client, 'get_initiative', { workspace: WORKSPACE, id: initiative.id })).json.initiative
  assert(initiativeReadback.icon === 'Rocket' && initiativeReadback.color === '#26b5ce', 'initiative icon/color readback mismatch')
}

async function scenarioDiscord(client, sandbox) {
  const target = parseDiscordMessageUrl(argValue('--discord-url') ?? process.env.LINEAR_DISCORD_TEST_URL)
  const issue = await createIssue(client, sandbox, 'discord', 'attachment')
  const attachment = nodeFrom((await callJson(client, 'link_attachment_discord', {
    workspace: WORKSPACE,
    issueId: issue.id,
    channelId: target.channelId,
    messageId: target.messageId,
    url: target.url,
    title: fixtureName('discord attachment'),
  })).json, ['attachmentLinkDiscord', 'attachment'])
  cleanup.attachments.push(attachment.id)
  assert(attachment.url === target.url, 'Discord attachment URL did not read back')

  const readback = (await callJson(client, 'get_issue', { workspace: WORKSPACE, id: issue.id })).json.issue
  assert(
    readback.attachments.nodes.some(item => item.id === attachment.id || item.url === target.url),
    'Discord attachment was not present on issue readback',
  )
}

async function scenarioNotifications(client, sandbox) {
  const issue = await createIssue(client, sandbox, 'notifications', 'reminder')
  const reminderAt = new Date(Date.now() + 15000).toISOString()
  await callJson(client, 'issue_reminder', {
    workspace: WORKSPACE,
    id: issue.id,
    reminderAt,
  })

  let notification = null
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await sleep(1500)
    const notifications = (await callJson(client, 'list_notifications', {
      workspace: WORKSPACE,
      includeArchived: true,
      first: 50,
    })).json.notifications.nodes
    notification = notifications.find(item => item.issue?.id === issue.id || item.issueId === issue.id)
    if (notification) break
  }

  if (!notification) {
    summary.warnings.push('No disposable reminder notification appeared; notification lifecycle smoke skipped after read-only list check.')
    return
  }

  cleanup.notifications.push(notification.id)
  const unread = nodeFrom((await callJson(client, 'mark_notification_unread', {
    workspace: WORKSPACE,
    id: notification.id,
  })).json, ['notificationUpdate', 'notification'])
  assert(unread.readAt === null, 'mark_notification_unread did not clear readAt')

  const read = nodeFrom((await callJson(client, 'mark_notification_read', {
    workspace: WORKSPACE,
    id: notification.id,
  })).json, ['notificationUpdate', 'notification'])
  assert(read.readAt, 'mark_notification_read did not set readAt')

  const archived = nodeFrom((await callJson(client, 'archive_notification', {
    workspace: WORKSPACE,
    id: notification.id,
  })).json, ['notificationArchive', 'entity'])
  assert(archived.archivedAt, 'archive_notification did not set archivedAt')

  const unarchived = nodeFrom((await callJson(client, 'unarchive_notification', {
    workspace: WORKSPACE,
    id: notification.id,
  })).json, ['notificationUnarchive', 'entity'])
  assert(!unarchived.archivedAt, 'unarchive_notification did not clear archivedAt')
}

async function scenarioSubscriptions(client, sandbox) {
  const viewer = (await callJson(client, 'get_viewer', { workspace: WORKSPACE })).json.viewer
  const issue = await createIssue(client, sandbox, 'subscriptions', 'watch')

  await callJson(client, 'unsubscribe_issue', { workspace: WORKSPACE, id: issue.id, userId: viewer.id })
  let subscribers = (await callJson(client, 'list_issue_subscribers', { workspace: WORKSPACE, id: issue.id })).json.issue.subscribers.nodes
  assert(!subscribers.some(user => user.id === viewer.id), 'unsubscribe_issue did not remove viewer from subscribers')

  const subscribed = nodeFrom((await callJson(client, 'subscribe_issue', {
    workspace: WORKSPACE,
    id: issue.id,
    userId: viewer.id,
  })).json, ['issueUpdate', 'issue'])
  assert(subscribed.subscribers.nodes.some(user => user.id === viewer.id), 'subscribe_issue did not read back viewer subscriber')

  await callJson(client, 'unsubscribe_issue', { workspace: WORKSPACE, id: issue.id, userId: viewer.id })
  subscribers = (await callJson(client, 'list_issue_subscribers', { workspace: WORKSPACE, id: issue.id })).json.issue.subscribers.nodes
  assert(!subscribers.some(user => user.id === viewer.id), 'final unsubscribe_issue did not remove viewer from subscribers')
}

function parseTemplateDataString(template) {
  assert(typeof template.templateData === 'string', 'templateData did not read back as a JSON string')
  return JSON.parse(template.templateData)
}

async function trackRecurringTemplateIssues(client, titlePrefix) {
  const issues = (await callJson(client, 'search_issues', {
    workspace: WORKSPACE,
    query: titlePrefix,
    first: 20,
  })).json.issues.nodes.filter(issue => issue.title?.startsWith(titlePrefix))
  for (const issue of issues) {
    if (!cleanup.issues.includes(issue.id)) cleanup.issues.push(issue.id)
  }
  if (issues.length > 0) {
    summary.warnings.push(`${issues.length} recurring template issue fixture(s) spawned and queued for archive cleanup.`)
  }
}

async function trackCurrentRunIssueFixtures(client) {
  const issues = (await callJson(client, 'search_issues', {
    workspace: WORKSPACE,
    query: runId,
    first: 100,
  })).json.issues.nodes.filter(issue => issue.title?.startsWith(FIXTURE_PREFIX) && issue.title?.includes(runId))
  let added = 0
  for (const issue of issues) {
    if (!cleanup.issues.includes(issue.id)) {
      cleanup.issues.push(issue.id)
      added += 1
    }
  }
  if (added > 0) {
    summary.warnings.push(`${added} current-run issue fixture(s) found during final cleanup sweep and queued for archive cleanup.`)
  }
  return added
}

async function scenarioTemplates(client, sandbox) {
  const issueTitle = fixtureName('templates recurring issue')
  const updatedIssueTitle = fixtureName('templates recurring issue updated')
  const created = nodeFrom((await callJson(client, 'create_recurring_issue_template', {
    workspace: WORKSPACE,
    name: fixtureName('templates recurring'),
    teamId: sandbox.team.id,
    description: 'Recurring issue template fixture',
    icon: 'Health',
    color: '#5e6ad2',
    title: issueTitle,
    issueDescription: 'Recurring issue generated by the MCP live smoke.',
    labelIds: [sandbox.issueLabel.id],
    scheduleInterval: 1,
    scheduleType: 'weeks',
    startAt: isoDate(120),
  })).json, ['templateCreate', 'template'])
  cleanup.templates.push(created.id)
  assert(created.type === 'recurringIssue', 'create_recurring_issue_template did not create recurringIssue type')
  let templateData = parseTemplateDataString(created)
  assert(templateData.schedule?.type === 'weeks' && templateData.schedule?.interval === 1, 'recurring template schedule did not read back')
  await trackRecurringTemplateIssues(client, issueTitle)

  const updated = nodeFrom((await callJson(client, 'update_recurring_issue_template', {
    workspace: WORKSPACE,
    id: created.id,
    name: fixtureName('templates recurring updated'),
    title: updatedIssueTitle,
    scheduleInterval: 2,
    startAt: isoDate(150),
  })).json, ['templateUpdate', 'template'])
  templateData = parseTemplateDataString(updated)
  assert(updated.name === fixtureName('templates recurring updated'), 'recurring template name update did not read back')
  assert(templateData.title === updatedIssueTitle, 'recurring template issue title update did not read back')
  assert(templateData.schedule?.interval === 2 && templateData.schedule?.startAt === isoDate(150), 'recurring template schedule update did not read back')
  await trackRecurringTemplateIssues(client, updatedIssueTitle)

  const readback = (await callJson(client, 'get_template', { workspace: WORKSPACE, id: created.id })).json.template
  assert(readback.id === created.id, 'get_template did not read back recurring template')
  const teamTemplates = (await callJson(client, 'list_templates', { workspace: WORKSPACE, teamId: sandbox.team.id })).json.team.templates.nodes
  assert(teamTemplates.some(template => template.id === created.id), 'team-level list_templates did not include recurring template')
}

async function cleanupFixtures(client) {
  if (keepFixtures) {
    summary.cleanup.push('Skipped cleanup because --keep-fixtures was set.')
    return
  }

  async function runCleanupCalls(calls) {
    for (const [name, args] of calls) {
      const result = await client.call(name, { workspace: WORKSPACE, ...args }, { allowError: true })
      if (result.isError && name === 'delete_issue_label') {
        await client.call('issue_label_retire', { workspace: WORKSPACE, ...args }, { allowError: true })
      }
      if (result.isError && name === 'delete_project_label') {
        await client.call('project_label_retire', { workspace: WORKSPACE, ...args }, { allowError: true })
      }
      summary.cleanup.push(`${result.isError ? 'warn' : 'ok'} ${name} ${args.id}`)
    }
  }

  await trackCurrentRunIssueFixtures(client)
  await runCleanupCalls([
    ...cleanup.attachments.slice().reverse().map(id => ['delete_attachment', { id }]),
    ...cleanup.favorites.slice().reverse().map(id => ['delete_favorite', { id }]),
    ...cleanup.views.slice().reverse().map(id => ['delete_view', { id }]),
    ...cleanup.milestones.slice().reverse().map(id => ['delete_project_milestone', { id }]),
    ...cleanup.documents.slice().reverse().map(id => ['delete_document', { id }]),
    ...cleanup.templates.slice().reverse().map(id => ['delete_template', { id }]),
    ...cleanup.notifications.slice().reverse().map(id => ['archive_notification', { id }]),
  ])

  for (const waitMs of [1000, 2000, 5000]) {
    await sleep(waitMs)
    await trackCurrentRunIssueFixtures(client)
  }
  await runCleanupCalls([
    ...cleanup.issues.slice().reverse().map(id => ['archive_issue', { id }]),
    ...cleanup.initiatives.slice().reverse().map(id => ['archive_initiative', { id }]),
    ...cleanup.projects.slice().reverse().map(id => ['archive_project', { id }]),
    ...cleanup.issueLabels.slice().reverse().map(id => ['delete_issue_label', { id }]),
    ...cleanup.projectLabels.slice().reverse().map(id => ['delete_project_label', { id }]),
  ])

  const archivedIssueIds = new Set(cleanup.issues)
  await sleep(2000)
  await trackCurrentRunIssueFixtures(client)
  const lateIssueIds = cleanup.issues.filter(id => !archivedIssueIds.has(id))
  if (lateIssueIds.length > 0) {
    await runCleanupCalls(lateIssueIds.slice().reverse().map(id => ['archive_issue', { id }]))
  }
}

const scenarioFns = {
  favorites: scenarioFavorites,
  labels: scenarioLabels,
  duplicate: scenarioDuplicate,
  organize: scenarioOrganize,
  comments: scenarioComments,
  views: scenarioViews,
  icons: scenarioIcons,
  discord: scenarioDiscord,
  notifications: scenarioNotifications,
  subscriptions: scenarioSubscriptions,
  templates: scenarioTemplates,
}

const client = new McpClient(command)
try {
  summary.server = await client.init()
  const sandbox = await ensureSandbox(client)
  summary.sandbox = {
    team: sandbox.team.key,
    projectId: sandbox.project.id,
    issueLabelId: sandbox.issueLabel.id,
    projectLabelId: sandbox.projectLabel.id,
    duplicateStateId: sandbox.duplicateState?.id ?? null,
  }
  await scanStaleFixtures(client)
  for (const name of scenarioNames) {
    const fn = scenarioFns[name]
    if (!fn) throw new Error(`Unknown scenario "${name}". Available: ${Object.keys(scenarioFns).join(', ')}, all`)
    await fn(client, sandbox)
    summary.executed.push(name)
  }
} finally {
  try {
    await cleanupFixtures(client)
  } finally {
    await client.close()
  }
}

console.log(JSON.stringify(summary, null, 2))
