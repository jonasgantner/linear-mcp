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
  }

  request(method, params = {}) {
    const id = this.nextId++
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
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
      clientInfo: { name: 'linear-mcp-identifier-smoke', version: '0.1.0' },
    })
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`)
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

function identifierSample(nodes, label) {
  assert.ok(nodes.length > 0, `${label}: no entities returned`)
  for (const node of nodes) {
    assert.ok(Object.hasOwn(node, 'identifier'), `${label}: identifier field is missing from readback`)
  }
  const sample = nodes.find(node => typeof node.identifier === 'string' && node.identifier.length > 0)
  assert.ok(sample, `${label}: no entity with a human-readable identifier was returned`)
  return sample
}

async function checkWorkspace(client, workspace) {
  const projects = (await client.call('search_projects', { workspace, first: 25 })).projects.nodes
  const project = identifierSample(projects, `${workspace} projects`)
  const projectDetail = (await client.call('get_project', { workspace, id: project.identifier })).project
  assert.equal(projectDetail.id, project.id, `${workspace}: project identifier resolved to a different UUID`)
  assert.equal(projectDetail.identifier, project.identifier, `${workspace}: project detail identifier mismatch`)

  const initiatives = (await client.call('list_initiatives', { workspace, first: 25 })).initiatives.nodes
  const initiative = identifierSample(initiatives, `${workspace} initiatives`)
  const initiativeDetail = (await client.call('get_initiative', { workspace, id: initiative.identifier })).initiative
  assert.equal(initiativeDetail.id, initiative.id, `${workspace}: initiative identifier resolved to a different UUID`)
  assert.equal(initiativeDetail.identifier, initiative.identifier, `${workspace}: initiative detail identifier mismatch`)

  const links = (await client.call('list_initiative_project_links', { workspace, first: 1 })).initiativeToProjects.nodes
  const linkedInitiativeProject = links.find(link =>
    typeof link.initiative?.identifier === 'string' && typeof link.project?.id === 'string')
  let linkLookupChecked = false
  if (linkedInitiativeProject) {
    const detail = (await client.call('get_initiative', {
      workspace,
      id: linkedInitiativeProject.initiative.identifier,
    })).initiative
    assert.ok(
      detail.initiativeToProjects.nodes.some(link => link.project.id === linkedInitiativeProject.project.id),
      `${workspace}: identifier lookup lost initiative-project links`,
    )
    linkLookupChecked = true
  }

  return {
    projectIdentifier: project.identifier,
    initiativeIdentifier: initiative.identifier,
    linkLookupChecked,
  }
}

const client = new McpClient(wrapper)
try {
  await client.init()
  const results = {}
  for (const workspace of workspaces) results[workspace] = await checkWorkspace(client, workspace)
  console.log(JSON.stringify({ ok: true, workspaces: results }, null, 2))
} finally {
  client.close()
  if (client.stderr.trim()) console.error(client.stderr.trim())
}
