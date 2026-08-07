import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { authorizationHeader } from '../client.js'
import { discoverWorkspaces, selectAuthorWorkspace } from '../workspaces.js'

const userToken = 'test-user-token-do-not-log'
const appToken = 'test-app-token-do-not-log'

const defaultWorkspace = discoverWorkspaces({ LINEAR_TEST_TOKEN: userToken })[0]
assert(defaultWorkspace)
assert.equal(defaultWorkspace.writeActor, 'user')
assert.equal(selectAuthorWorkspace(defaultWorkspace).token, userToken)
assert.equal(authorizationHeader(defaultWorkspace), userToken)

const appWorkspace = discoverWorkspaces({
  LINEAR_TEST_TOKEN: userToken,
  LINEAR_TEST_APP_TOKEN: appToken,
  LINEAR_TEST_WRITE_ACTOR: 'app',
})[0]
assert(appWorkspace)
const authorWorkspace = selectAuthorWorkspace(appWorkspace)
assert.equal(authorWorkspace.token, appToken)
assert.equal(authorWorkspace.authScheme, 'oauth-bearer')
assert.equal(authorizationHeader(authorWorkspace), `Bearer ${appToken}`)

assert.throws(
  () => discoverWorkspaces({
    LINEAR_TEST_TOKEN: userToken,
    LINEAR_TEST_WRITE_ACTOR: 'app',
  }),
  /refusing to fall back to the user actor/,
)

assert.throws(
  () => discoverWorkspaces({
    LINEAR_TEST_TOKEN: userToken,
    LINEAR_TEST_APP_TOKEN: appToken,
    LINEAR_TEST_WRITE_ACTOR: 'unknown',
  }),
  /Invalid LINEAR_TEST_WRITE_ACTOR/,
)

const allWorkspaces = discoverWorkspaces({
  LINEAR_BIZ_TOKEN: 'biz-user-token',
  LINEAR_PERSONAL_TOKEN: 'personal-user-token',
  LINEAR_TEST_TOKEN: userToken,
  LINEAR_TEST_APP_TOKEN: appToken,
  LINEAR_TEST_WRITE_ACTOR: 'app',
})
for (const workspace of allWorkspaces.filter(candidate => candidate.name !== 'test')) {
  assert.equal(workspace.writeActor, 'user')
  assert.equal(workspace.authScheme, 'api-key')
  assert.equal(workspace.appToken, undefined)
  assert.equal(selectAuthorWorkspace(workspace), workspace)
}

function toolBlock(source: string, name: string): string {
  const marker = `name: '${name}'`
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, `Missing ${name} tool definition`)
  const next = source.indexOf("\n  {\n    name: '", start + marker.length)
  return source.slice(start, next === -1 ? source.length : next)
}

const commentSource = readFileSync(new URL('../tools/comments.ts', import.meta.url), 'utf8')
const documentSource = readFileSync(new URL('../tools/documents.ts', import.meta.url), 'utf8')
const fileSource = readFileSync(new URL('../tools/files.ts', import.meta.url), 'utf8')
for (const [source, name] of [
  [commentSource, 'create_comment'],
  [documentSource, 'create_document'],
  [fileSource, 'create_comment_with_files'],
  [fileSource, 'create_document_with_files'],
] as const) {
  assert.match(toolBlock(source, name), /resolveAuthorWorkspace/, `${name} must use the author client`)
}
for (const [source, name] of [
  [commentSource, 'get_comment'],
  [commentSource, 'update_comment'],
  [documentSource, 'get_document'],
  [fileSource, 'upload_file'],
] as const) {
  assert.doesNotMatch(toolBlock(source, name), /resolveAuthorWorkspace/, `${name} must stay on the user client`)
}

const child = spawn('bun', ['run', 'index.ts'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: {
    ...process.env,
    LINEAR_BIZ_TOKEN: '',
    LINEAR_PERSONAL_TOKEN: '',
    LINEAR_TEST_TOKEN: userToken,
    LINEAR_TEST_APP_TOKEN: appToken,
    LINEAR_TEST_WRITE_ACTOR: 'app',
  },
  stdio: ['pipe', 'ignore', 'pipe'],
})

let stderr = ''
child.stderr.setEncoding('utf8')
child.stderr.on('data', chunk => {
  stderr += chunk
  if (stderr.includes('server ready')) child.stdin.end()
})

await new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(() => {
    child.kill('SIGTERM')
    reject(new Error('Timed out waiting for MCP log-safety check'))
  }, 5_000)
  child.once('error', reject)
  child.once('exit', code => {
    clearTimeout(timeout)
    if (code !== 0) reject(new Error(`MCP log-safety child exited ${code}: ${stderr}`))
    else resolve()
  })
})

assert.match(stderr, /configured workspace\(s\): test/)
assert.doesNotMatch(stderr, new RegExp(userToken))
assert.doesNotMatch(stderr, new RegExp(appToken))

console.log(JSON.stringify({ ok: true, cases: 7 }, null, 2))
