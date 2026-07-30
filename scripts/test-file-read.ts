import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rmdir, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateLinearUploadUrl } from '../client.js'
import { downloadFileToPath, MAX_FILE_DOWNLOAD_BYTES } from '../tools/files.js'
import { extractFileAssets } from '../tools/fileAssets.js'

const opaqueUrl = 'https://uploads.linear.app/workspace-id/storage-id?signature=private'
const assets = extractFileAssets([
  `[vendor-form.docx](${opaqueUrl})`,
  `Duplicate: ${opaqueUrl}`,
  '![Preview](https://uploads.linear.app/workspace-id/preview.png)',
  '[Ordinary link](https://linear.app/example)',
].join('\n'))

assert.deepEqual(
  assets.map(asset => ({ type: asset.type, label: asset.label, fileName: asset.fileName, extension: asset.extension })),
  [
    { type: 'file', label: 'vendor-form.docx', fileName: 'vendor-form.docx', extension: 'docx' },
    { type: 'image', label: 'Preview', fileName: 'preview.png', extension: 'png' },
  ],
)

assert.equal(validateLinearUploadUrl(opaqueUrl).hostname, 'uploads.linear.app')
for (const invalid of [
  'http://uploads.linear.app/file',
  'https://uploads.linear.app:8443/file',
  'https://uploads.linear.app.evil.example/file',
  'https://example.com/file',
  'not-a-url',
]) {
  assert.throws(() => validateLinearUploadUrl(invalid), /Linear file URL/)
}

const directory = await mkdtemp(join(tmpdir(), 'linear-mcp-file-read-'))
const destinationPath = join(directory, 'download.bin')
const fixture = new TextEncoder().encode('Linear private file download fixture\n')
const fakeClient = {
  async fetchFile(): Promise<Response> {
    return new Response(fixture, {
      headers: {
        'content-length': String(fixture.byteLength),
        'content-type': 'application/octet-stream',
      },
    })
  },
}

try {
  const result = await downloadFileToPath(fakeClient, opaqueUrl, destinationPath)
  assert.deepEqual(new Uint8Array(await readFile(destinationPath)), fixture)
  assert.equal(result.size, fixture.byteLength)
  assert.equal(result.sha256, createHash('sha256').update(fixture).digest('hex'))
  assert.equal(result.contentType, 'application/octet-stream')

  await assert.rejects(
    () => downloadFileToPath(fakeClient, opaqueUrl, destinationPath),
    /Destination already exists/,
  )

  const oversizedClient = {
    async fetchFile(): Promise<Response> {
      return new Response('x', { headers: { 'content-length': String(MAX_FILE_DOWNLOAD_BYTES + 1) } })
    },
  }
  await assert.rejects(
    () => downloadFileToPath(oversizedClient, opaqueUrl, join(directory, 'oversized.bin')),
    /exceeds the 10 GB download limit/,
  )

  await writeFile(destinationPath, 'old')
  const overwritten = await downloadFileToPath(fakeClient, opaqueUrl, destinationPath, true)
  assert.equal(overwritten.size, fixture.byteLength)
  assert.deepEqual(new Uint8Array(await readFile(destinationPath)), fixture)
} finally {
  await unlink(destinationPath).catch(() => undefined)
  await rmdir(directory).catch(() => undefined)
}

console.log(JSON.stringify({ ok: true, maxFileDownloadBytes: MAX_FILE_DOWNLOAD_BYTES }, null, 2))
