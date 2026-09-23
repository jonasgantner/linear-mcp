import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { requireLiveWriteTarget } from './live-write-guard.mjs'

const wrapper = '/Users/jonas/.agents/mcp/wrappers/linear.sh'
const workspace = requireLiveWriteTarget()
const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)

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
    await this.request('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'linear-mcp-archive-write-smoke', version: '0.1.0' },
    })
    this.send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })
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

const client = new McpClient(wrapper)
let projectId
let initiativeId
let documentId

async function restoreThenTrash(tool, id, deleteTool) {
  if (!id) return
  try {
    await client.call(tool, { workspace, id })
  } catch {
    // The fixture can already be active if the operation failed before its first lifecycle change.
  }
  await client.call(deleteTool, { workspace, id })
}

function assertRestored(node, label) {
  assert.equal(node.archivedAt, null, `${label} should have no archivedAt timestamp after restore`)
  assert.notEqual(node.trashed, true, `${label} should not remain trashed after restore`)
}

try {
  await client.init()
  const teamId = (await client.call('get_teams', { workspace })).teams.nodes[0]?.id
  assert.ok(teamId, `${workspace} must contain a team`)

  projectId = (await client.call('create_project', {
    workspace,
    name: `MCP archive project smoke ${runId}`,
    teamIds: [teamId],
  })).projectCreate?.project?.id
  assert.ok(projectId, 'create_project must return an ID')
  await client.call('delete_project', { workspace, id: projectId })
  assert.equal((await client.call('get_project', { workspace, id: projectId })).project.trashed, true)
  await client.call('unarchive_project', { workspace, id: projectId })
  assertRestored((await client.call('get_project', { workspace, id: projectId })).project, 'project')

  initiativeId = (await client.call('create_initiative', {
    workspace,
    name: `MCP archive initiative smoke ${runId}`,
  })).initiativeCreate?.initiative?.id
  assert.ok(initiativeId, 'create_initiative must return an ID')
  await client.call('archive_initiative', { workspace, id: initiativeId })
  assert.ok((await client.call('get_initiative', { workspace, id: initiativeId })).initiative.archivedAt)
  await client.call('unarchive_initiative', { workspace, id: initiativeId })
  assertRestored((await client.call('get_initiative', { workspace, id: initiativeId })).initiative, 'initiative archive restore')
  await client.call('delete_initiative', { workspace, id: initiativeId })
  assert.equal((await client.call('get_initiative', { workspace, id: initiativeId })).initiative.trashed, true)
  await client.call('unarchive_initiative', { workspace, id: initiativeId })
  assertRestored((await client.call('get_initiative', { workspace, id: initiativeId })).initiative, 'initiative trash restore')

  documentId = (await client.call('create_document', {
    workspace,
    teamId,
    title: `MCP archive document smoke ${runId}`,
    content: 'Disposable archive lifecycle fixture.',
  })).documentCreate?.document?.id
  assert.ok(documentId, 'create_document must return an ID')
  await client.call('delete_document', { workspace, id: documentId })
  assert.equal((await client.call('get_document', { workspace, id: documentId, commentsFirst: 1 })).document.trashed, true)
  await client.call('unarchive_document', { workspace, id: documentId })
  assertRestored((await client.call('get_document', { workspace, id: documentId, commentsFirst: 1 })).document, 'document')

  console.log(JSON.stringify({
    ok: true,
    workspace,
    verified: ['project trash/restore', 'initiative archive/restore and trash/restore', 'document trash/restore'],
  }, null, 2))
} finally {
  const cleanupErrors = []
  for (const [restoreTool, id, deleteTool] of [
    ['unarchive_document', documentId, 'delete_document'],
    ['unarchive_initiative', initiativeId, 'delete_initiative'],
    ['unarchive_project', projectId, 'delete_project'],
  ]) {
    if (!id) continue
    try {
      await restoreThenTrash(restoreTool, id, deleteTool)
    } catch (error) {
      cleanupErrors.push(`${deleteTool} ${id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  client.close()
  if (client.stderr.trim()) console.error(client.stderr.trim())
  if (cleanupErrors.length > 0) {
    throw new Error(`Archive write smoke cleanup failed:\n${cleanupErrors.map(error => `- ${error}`).join('\n')}`)
  }
}
