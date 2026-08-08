import { spawn } from 'node:child_process'
import { requireLiveWriteTarget } from './live-write-guard.mjs'

const DEFAULT_COMMAND = '/Users/jonas/.agents/mcp/wrappers/linear.sh'
const WORKSPACE = requireLiveWriteTarget()
const command = argValue('--command') ?? DEFAULT_COMMAND
const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
const TOP_LEVEL_COUNT = Number(argValue('--top-level') ?? 30)
const REPLY_COUNT = Number(argValue('--replies') ?? 55)

function argValue(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? null : process.argv[index + 1] ?? null
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
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
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), 120000)
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
      clientInfo: { name: 'linear-mcp-comments-full-smoke', version: '0.1.0' },
    })
    this.send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })
    return init
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
    if (result.isError && !options.allowError) throw new Error(`${name}: ${text}`)
    return { name, isError: Boolean(result.isError), text, json }
  }

  async close() {
    this.child.stdin.end()
    this.child.kill('SIGTERM')
  }
}

function nodeFrom(payload, path) {
  let value = payload
  for (const key of path) value = value?.[key]
  return value
}

async function main() {
  const client = new McpClient(command)
  let issueId = null
  let operationError = null
  let cleanupError = null
  const createdTopLevelIds = []
  const createdReplyIds = []

  try {
    const init = await client.init()
    const teams = (await client.call('get_teams', { workspace: WORKSPACE })).json.teams.nodes
    const team = teams[0]
    assert(team?.id, `No team found in workspace ${WORKSPACE}`)

    const issue = nodeFrom((await client.call('create_issue', {
      workspace: WORKSPACE,
      teamId: team.id,
      title: `MCP Comment Full Smoke ${runId}`,
      description: `Disposable full-comment pagination smoke ${runId}.`,
    })).json, ['issueCreate', 'issue'])
    issueId = issue.id

    const parent = nodeFrom((await client.call('create_comment', {
      workspace: WORKSPACE,
      issueId,
      body: `parent ${runId}`,
    })).json, ['commentCreate', 'comment'])
    createdTopLevelIds.push(parent.id)

    for (let i = 0; i < TOP_LEVEL_COUNT; i += 1) {
      const comment = nodeFrom((await client.call('create_comment', {
        workspace: WORKSPACE,
        issueId,
        body: `top-level ${runId} ${i + 1}`,
      })).json, ['commentCreate', 'comment'])
      createdTopLevelIds.push(comment.id)
    }

    for (let i = 0; i < REPLY_COUNT; i += 1) {
      const reply = nodeFrom((await client.call('create_comment', {
        workspace: WORKSPACE,
        issueId,
        parentId: parent.id,
        body: `reply ${runId} ${i + 1}`,
      })).json, ['commentCreate', 'comment'])
      createdReplyIds.push(reply.id)
    }

    const listed = (await client.call('list_comments', {
      workspace: WORKSPACE,
      issueId,
      first: 100,
    })).json.comments
    const nodes = listed.nodes
    const nodeIds = new Set(nodes.map(comment => comment.id))
    const parentReadback = nodes.find(comment => comment.id === parent.id)
    const childIds = new Set(parentReadback?.children?.nodes?.map(comment => comment.id) ?? [])

    for (const id of createdTopLevelIds) {
      assert(nodeIds.has(id), `list_comments(first:100) omitted top-level comment ${id}`)
    }
    for (const id of createdReplyIds) {
      assert(nodeIds.has(id) || childIds.has(id), `list_comments(first:100) omitted reply ${id}`)
    }
    assert(parentReadback, 'list_comments(first:100) omitted parent comment')
    assert(childIds.size >= REPLY_COUNT, `parent child readback returned ${childIds.size}/${REPLY_COUNT} replies`)
    assert(parentReadback.children.pageInfo.hasNextPage === false, 'parent child readback still has an unread next page')

    const directParent = (await client.call('get_comment', {
      workspace: WORKSPACE,
      id: parent.id,
    })).json.comment
    assert(directParent.children.nodes.length >= REPLY_COUNT, 'get_comment did not include all child replies')
    assert(directParent.children.pageInfo.hasNextPage === false, 'get_comment child readback still has an unread next page')

    const issueReadback = (await client.call('get_issue', {
      workspace: WORKSPACE,
      id: issueId,
    })).json.issue
    const issueParent = issueReadback.comments.nodes.find(comment => comment.id === parent.id)
    assert(issueParent?.children?.nodes?.length >= REPLY_COUNT, 'get_issue comments did not include all child replies')

    console.log(JSON.stringify({
      ok: true,
      server: init.serverInfo?.name ?? null,
      workspace: WORKSPACE,
      issue: issue.identifier,
      commentsRead: nodes.length,
      parentChildrenRead: childIds.size,
    }, null, 2))
  } catch (error) {
    operationError = error
  } finally {
    if (issueId) {
      try {
        const result = await client.call('delete_issue', { workspace: WORKSPACE, id: issueId }, { allowError: true })
        if (result.isError) throw new Error(result.text)
      } catch (error) {
        cleanupError = new Error(`Cleanup failed for issue ${issueId}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    await client.close()
  }

  if (operationError && cleanupError) {
    throw new AggregateError([operationError, cleanupError], 'Live comment smoke and cleanup both failed')
  }
  if (operationError) throw operationError
  if (cleanupError) throw cleanupError
}

await main()
