import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const wrapper = '/Users/jonas/.agents/mcp/wrappers/linear.sh'
const workspaces = ['personal', 'interlink-group']

class McpClient {
  constructor(command) {
    this.child = spawn(command, [], { stdio: ['pipe', 'pipe', 'pipe'] })
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
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), 120_000)
      this.responses.set(id, message => {
        clearTimeout(timer)
        if (message.error) reject(new Error(`${method}: ${JSON.stringify(message.error)}`))
        else resolve(message.result)
      })
    })
  }

  async init() {
    const result = await this.request('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'linear-mcp-archive-read-smoke', version: '0.1.0' },
    })
    this.send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })
    return result
  }

  async call(name, args) {
    const result = await this.request('tools/call', { name, arguments: args })
    const text = (result.content ?? []).map(item => item.text ?? '').join('\n')
    if (result.isError) throw new Error(`${name}: ${text}`)
    return JSON.parse(text)
  }

  close() {
    this.child.stdin.end()
    this.child.kill('SIGTERM')
  }
}

function assertFields(node, fields, label) {
  for (const field of fields) {
    assert.ok(Object.hasOwn(node, field), `${label} is missing lifecycle field ${field}`)
  }
}

async function checkWorkspace(client, workspace) {
  const active = (await client.call('search_issues', { workspace, first: 250 })).issues
  assert.ok(active.nodes.every(issue => issue.archivedAt === null), `${workspace}: default issue search returned an archived issue`)

  const inclusive = (await client.call('search_issues', { workspace, includeArchived: true, first: 250 })).issues
  const inclusiveArchived = inclusive.nodes.filter(issue => issue.archivedAt !== null)
  assert.ok(inclusiveArchived.length > 0, `${workspace}: includeArchived did not return an identifiable archived issue`)
  for (const issue of inclusive.nodes) assertFields(issue, ['archivedAt', 'autoArchivedAt', 'trashed'], `${workspace} issue`)

  const archivedPage = (await client.call('search_issues', { workspace, archivedOnly: true, first: 1 })).issues
  assert.ok(archivedPage.nodes.length > 0, `${workspace}: archivedOnly returned no issues`)
  assert.ok(archivedPage.nodes.every(issue => issue.archivedAt !== null), `${workspace}: archivedOnly returned an issue without archivedAt`)

  let paginatedCount = archivedPage.nodes.length
  if (archivedPage.pageInfo.hasNextPage) {
    const nextPage = (await client.call('search_issues', {
      workspace,
      archivedOnly: true,
      first: 1,
      after: archivedPage.pageInfo.endCursor,
    })).issues
    assert.ok(nextPage.nodes.every(issue => issue.archivedAt !== null), `${workspace}: archivedOnly pagination returned an active issue`)
    paginatedCount += nextPage.nodes.length
  }

  const probe = archivedPage.nodes[0]
  const teamKey = probe.team?.key
  assert.ok(teamKey, `${workspace}: archived issue is missing a team key`)
  const rawFiltered = (await client.call('search_issues', {
    workspace,
    archivedOnly: true,
    filter: { team: { key: { eq: teamKey } } },
    first: 10,
  })).issues.nodes
  assert.ok(rawFiltered.length > 0 && rawFiltered.every(issue => issue.archivedAt !== null && issue.team?.key === teamKey), `${workspace}: raw filter did not combine with archivedOnly`)

  const keyword = probe.title.trim().slice(0, 80)
  const keywordFiltered = (await client.call('search_issues', {
    workspace,
    archivedOnly: true,
    query: keyword,
    first: 10,
  })).issues.nodes
  assert.ok(keywordFiltered.length > 0 && keywordFiltered.every(issue => issue.archivedAt !== null), `${workspace}: keyword filter did not combine with archivedOnly`)

  const surfaces = [
    {
      tool: 'search_projects',
      root: 'projects',
      fields: ['archivedAt', 'autoArchivedAt', 'trashed'],
      getTool: 'get_project',
    },
    {
      tool: 'list_initiatives',
      root: 'initiatives',
      fields: ['archivedAt', 'trashed'],
      getTool: 'get_initiative',
    },
    {
      tool: 'search_documents',
      root: 'documents',
      fields: ['archivedAt', 'trashed'],
      getTool: 'get_document',
    },
    {
      tool: 'list_cycles',
      root: 'cycles',
      fields: ['archivedAt', 'autoArchivedAt'],
    },
  ]

  const surfaceCounts = {}
  for (const surface of surfaces) {
    const first = surface.tool === 'search_projects' ? 10 : 25
    const connection = (await client.call(surface.tool, { workspace, includeArchived: true, first }))[surface.root]
    for (const node of connection.nodes) assertFields(node, surface.fields, `${workspace} ${surface.root}`)
    surfaceCounts[surface.root] = connection.nodes.length

    const archivedNode = connection.nodes.find(node => node.archivedAt !== null)
    if (archivedNode && surface.getTool) {
      const singular = surface.root.slice(0, -1)
      const detail = (await client.call(surface.getTool, { workspace, id: archivedNode.id, commentsFirst: 1 }))[singular]
      assertFields(detail, surface.fields, `${workspace} ${singular} detail`)
    }
  }

  return {
    activeIssuesChecked: active.nodes.length,
    inclusiveIssuesChecked: inclusive.nodes.length,
    identifiableArchivedIssues: inclusiveArchived.length,
    archivedPaginationItemsChecked: paginatedCount,
    archiveAwareSurfaceItemsChecked: surfaceCounts,
  }
}

const client = new McpClient(wrapper)
try {
  const init = await client.init()
  const results = {}
  for (const workspace of workspaces) results[workspace] = await checkWorkspace(client, workspace)
  console.log(JSON.stringify({ ok: true, server: init.serverInfo?.name ?? null, workspaces: results }, null, 2))
} finally {
  client.close()
  if (client.stderr.trim()) console.error(client.stderr.trim())
}
