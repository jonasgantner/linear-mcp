import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rmdir, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { requireLiveWriteTarget } from './live-write-guard.mjs'

const wrapper = '/Users/jonas/.agents/mcp/wrappers/linear.sh'
const workspace = requireLiveWriteTarget()
const child = spawn(wrapper, [], { stdio: ['pipe', 'pipe', 'pipe'] })
let stdout = ''
let stderr = ''
let nextId = 1
const responses = new Map()

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`)
}

function request(method, params = {}) {
  const id = nextId++
  send({ jsonrpc: '2.0', id, method, params })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), 60_000)
    responses.set(id, message => {
      clearTimeout(timer)
      if (message.error) reject(new Error(`${method}: ${JSON.stringify(message.error)}`))
      else resolve(message.result)
    })
  })
}

child.stdout.on('data', chunk => {
  stdout += chunk.toString('utf8')
  let index
  while ((index = stdout.indexOf('\n')) !== -1) {
    const line = stdout.slice(0, index).trim()
    stdout = stdout.slice(index + 1)
    if (!line) continue
    const message = JSON.parse(line)
    if (message.id !== undefined && responses.has(message.id)) {
      responses.get(message.id)(message)
      responses.delete(message.id)
    }
  }
})

child.stderr.on('data', chunk => {
  stderr += chunk.toString('utf8')
})

async function call(name, args) {
  const result = await request('tools/call', { name, arguments: args })
  const text = (result.content ?? []).map(item => item.text ?? '').join('\n')
  if (result.isError) throw new Error(`${name}: ${text}`)
  return JSON.parse(text)
}

const directory = await mkdtemp(join(tmpdir(), 'linear-mcp-live-files-'))
const fixturePath = join(directory, 'private-file-fixture.txt')
const destinationPath = join(directory, 'downloaded-fixture.txt')
const fixture = `Linear private file live fixture ${randomUUID()}\n`
await writeFile(fixturePath, fixture)

let issueId
let commentId
let documentId
let attachmentId

try {
  await request('initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'linear-mcp-file-smoke', version: '0.1.0' },
  })
  send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })

  const teams = await call('get_teams', { workspace })
  const teamId = teams.teams?.nodes?.[0]?.id
  assert.ok(teamId, `${workspace} workspace should contain at least one team`)

  const issueCreate = await call('create_issue', {
    workspace,
    teamId,
    title: `MCP private file read smoke ${new Date().toISOString()}`,
    description: 'Disposable private-file smoke fixture.',
  })
  issueId = issueCreate.issueCreate?.issue?.id
  assert.ok(issueId, 'create_issue should return an issue ID')

  const upload = await call('upload_file', { workspace, path: fixturePath })
  const assetUrl = upload.upload?.assetUrl
  const markdown = upload.upload?.markdown
  assert.ok(assetUrl && markdown, 'upload_file should return an asset URL and markdown')

  await call('update_issue', {
    workspace,
    id: issueId,
    description: `Issue description fixture\n\n${markdown}`,
  })

  const commentCreate = await call('create_comment', {
    workspace,
    issueId,
    body: `Issue comment fixture\n\n${markdown}`,
  })
  commentId = commentCreate.commentCreate?.comment?.id
  assert.ok(commentId, 'create_comment should return a comment ID')

  const documentCreate = await call('create_document_with_files', {
    workspace,
    issueId,
    title: 'MCP private file document smoke',
    content: 'Document content fixture',
    paths: [fixturePath],
  })
  documentId = documentCreate.documentCreate?.document?.id
  assert.ok(documentId, 'create_document_with_files should return a document ID')

  const issue = (await call('get_issue', { workspace, id: issueId })).issue
  assert.equal(issue.descriptionAssets?.[0]?.url, assetUrl, 'issue description should expose the uploaded asset')
  assert.equal(issue.descriptionAssets?.[0]?.fileName, 'private-file-fixture.txt')
  const commentWithAsset = issue.comments?.nodes?.find(comment => comment.id === commentId)
  assert.equal(commentWithAsset?.assets?.[0]?.url, assetUrl, 'issue comment should expose the uploaded asset')

  const document = (await call('get_document', { workspace, id: documentId })).document
  assert.equal(document.contentAssets?.[0]?.fileName, 'private-file-fixture.txt', 'document content should expose the uploaded asset')

  const downloaded = await call('download_file', {
    workspace,
    url: assetUrl,
    destinationPath,
  })
  assert.equal(downloaded.download?.size, Buffer.byteLength(fixture))
  assert.equal(await readFile(destinationPath, 'utf8'), fixture)

  const attachmentUrl = `https://example.com/linear-mcp-file-smoke/${randomUUID()}`
  const attachmentCreate = await call('create_attachment', {
    workspace,
    issueId,
    title: 'MCP file smoke URL card',
    url: attachmentUrl,
  })
  attachmentId = attachmentCreate.attachmentCreate?.attachment?.id
  assert.ok(attachmentId, 'create_attachment should return an attachment ID')

  const attachment = (await call('get_attachment', { workspace, id: attachmentId })).attachment
  assert.equal(attachment?.url, attachmentUrl)
  assert.equal(attachment?.issue?.id, issueId)

  const byUrl = await call('find_attachments_by_url', { workspace, url: attachmentUrl })
  assert.ok(byUrl.attachmentsForURL?.nodes?.some(item => item.id === attachmentId))

  console.log(JSON.stringify({
    ok: true,
    workspace,
    verified: ['issue description assets', 'comment assets', 'document content assets', 'authenticated download', 'attachment by ID', 'attachments by URL'],
    downloaded: downloaded.download,
  }, null, 2))
} finally {
  const cleanupErrors = []
  for (const [tool, args] of [
    ['delete_attachment', attachmentId ? { workspace, id: attachmentId } : null],
    ['delete_comment', commentId ? { workspace, id: commentId } : null],
    ['delete_document', documentId ? { workspace, id: documentId } : null],
    ['delete_issue', issueId ? { workspace, id: issueId } : null],
  ]) {
    if (!args) continue
    try {
      await call(tool, args)
    } catch (error) {
      cleanupErrors.push(`${tool} ${args.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  child.stdin.end()
  child.kill('SIGTERM')
  await unlink(destinationPath).catch(() => undefined)
  await unlink(fixturePath).catch(() => undefined)
  await rmdir(directory).catch(() => undefined)
  if (stderr.trim()) console.error(stderr.trim())
  if (cleanupErrors.length > 0) {
    console.error(`Live file smoke cleanup failed:\n${cleanupErrors.map(error => `- ${error}`).join('\n')}`)
    process.exitCode = 1
  }
}
