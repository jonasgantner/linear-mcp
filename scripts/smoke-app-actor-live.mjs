import { execFileSync, spawn } from 'node:child_process'

const DEFAULT_COMMAND = '/Users/jonas/.agents/mcp/wrappers/linear-app-actor-test.sh'
const TEAM_ID = '83b626ec-5785-49e8-9d60-ff380a218320'
const APP_NAME = 'Codex Test'
const WORKSPACE = 'test'
const keepFixtures = process.argv.includes('--keep-fixtures')
const command = argValue('--command') ?? DEFAULT_COMMAND
const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)

function argValue(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? null : process.argv[index + 1] ?? null
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

class McpClient {
  constructor(commandPath, args = [], options = {}) {
    this.child = spawn(commandPath, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
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
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), 30_000)
      this.responses.set(id, value => {
        clearTimeout(timer)
        if (value.error) reject(new Error(`${method}: ${JSON.stringify(value.error)}`))
        else resolve(value.result)
      })
    })
  }

  async init() {
    await this.request('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'linear-app-actor-smoke', version: '0.1.0' },
    })
    this.send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })
  }

  async call(name, args = {}, { allowError = false } = {}) {
    const result = await this.request('tools/call', { name, arguments: args })
    const text = (result.content ?? []).map(item => item.text ?? '').join('\n')
    if (result.isError && !allowError) throw new Error(`${name}: ${text}`)
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      // Some expected failure responses are plain text.
    }
    return { isError: Boolean(result.isError), text, json }
  }

  close() {
    this.child.stdin.end()
    this.child.kill('SIGTERM')
  }
}

const expectedAppUserId = execFileSync('zsh', [
  '-lc',
  'source /Users/jonas/.agents/mcp/wrappers/_op-env.sh; op read "op://code-env/Linear Test Codex App/app-user-id"',
], { encoding: 'utf8' }).trim()

const client = new McpClient(command)
let invalidClient = null
let issue = null
let document = null
let failed = false

try {
  await client.init()
  const viewer = (await client.call('get_viewer', { workspace: WORKSPACE })).json?.viewer
  assert(viewer?.id !== expectedAppUserId, 'Read client unexpectedly uses the app actor')

  issue = (await client.call('create_issue', {
    workspace: WORKSPACE,
    teamId: TEAM_ID,
    title: `App actor attribution smoke ${runId}`,
    description: 'Disposable test fixture for Codex Test app attribution. No decision is recorded.',
  })).json?.issueCreate?.issue
  assert(issue?.id && issue?.identifier && issue?.url, 'Issue creation did not return an identifiable fixture')

  const rootComment = (await client.call('create_comment', {
    workspace: WORKSPACE,
    issueId: issue.id,
    body: 'Proposed finding: app-authored comment attribution is under test.',
  })).json?.commentCreate?.comment
  assert(rootComment?.user?.id === expectedAppUserId, 'Root comment was not authored by the expected app user')
  assert(rootComment?.user?.name === APP_NAME, 'Root comment did not use the app display name')

  const reply = (await client.call('create_comment', {
    workspace: WORKSPACE,
    issueId: issue.id,
    parentId: rootComment.id,
    body: 'Follow-up proposal from the app actor; still not a human decision.',
  })).json?.commentCreate?.comment
  assert(reply?.user?.id === expectedAppUserId, 'Reply was not authored by the expected app user')
  assert(reply?.parentId === rootComment.id, 'Reply did not retain its parent comment')

  document = (await client.call('create_document', {
    workspace: WORKSPACE,
    issueId: issue.id,
    title: `Proposed app actor audit ${runId}`,
    content: '# Proposed audit\n\nThis document contains app-authored proposals, not decisions.',
  })).json?.documentCreate?.document
  assert(document?.creator?.id === expectedAppUserId, 'Document was not created by the expected app user')
  assert(document?.creator?.name === APP_NAME, 'Document did not use the app display name')

  const commentsBefore = (await client.call('list_comments', {
    workspace: WORKSPACE,
    issueId: issue.id,
    first: 20,
  })).json?.comments?.nodes ?? []
  for (const id of [rootComment.id, reply.id]) {
    const found = commentsBefore.find(comment => comment.id === id)
    assert(found?.user?.id === expectedAppUserId, `Comment ${id} readback lost app provenance`)
  }

  const documentReadback = (await client.call('get_document', {
    workspace: WORKSPACE,
    id: document.id,
  })).json?.document
  assert(documentReadback?.creator?.id === expectedAppUserId, 'Document readback lost app provenance')

  const userToken = execFileSync('zsh', [
    '-lc',
    'source /Users/jonas/.agents/mcp/wrappers/_op-env.sh; op read "op://code-env/Linear Test/credential"',
  ], { encoding: 'utf8' }).trim()
  invalidClient = new McpClient('bun', ['run', 'index.ts'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: {
      ...process.env,
      LINEAR_BIZ_TOKEN: '',
      LINEAR_PERSONAL_TOKEN: '',
      LINEAR_TEST_TOKEN: userToken,
      LINEAR_TEST_APP_TOKEN: 'invalid-app-token',
      LINEAR_TEST_WRITE_ACTOR: 'app',
    },
  })
  await invalidClient.init()
  const invalidBody = `MUST-NOT-EXIST ${runId}`
  const invalidAttempt = await invalidClient.call('create_comment', {
    workspace: WORKSPACE,
    issueId: issue.id,
    body: invalidBody,
  }, { allowError: true })
  assert(invalidAttempt.isError, 'Invalid app token unexpectedly created a comment')

  const commentsAfter = (await client.call('list_comments', {
    workspace: WORKSPACE,
    issueId: issue.id,
    first: 20,
  })).json?.comments?.nodes ?? []
  assert(commentsAfter.length === commentsBefore.length, 'Invalid app token changed the comment count')
  assert(!commentsAfter.some(comment => comment.body === invalidBody), 'Invalid app token left a comment behind')

  console.log(JSON.stringify({
    ok: true,
    runId,
    humanReadActor: { id: viewer.id, name: viewer.name },
    appActor: { id: expectedAppUserId, name: APP_NAME },
    issue: { id: issue.id, identifier: issue.identifier, url: issue.url },
    rootComment: { id: rootComment.id, url: rootComment.url },
    reply: { id: reply.id, url: reply.url },
    document: { id: document.id, url: document.url },
    invalidTokenCreatedNothing: true,
    fixturesKept: keepFixtures,
  }, null, 2))
} catch (error) {
  failed = true
  throw error
} finally {
  invalidClient?.close()
  if (issue && (!keepFixtures || failed)) {
    if (document?.id) {
      await client.call('delete_document', { workspace: WORKSPACE, id: document.id }, { allowError: true })
    }
    await client.call('archive_issue', { workspace: WORKSPACE, id: issue.id }, { allowError: true })
  }
  client.close()
}
