import assert from 'node:assert/strict'
import { requireLiveWriteTarget } from './live-write-guard.mjs'

assert.throws(() => requireLiveWriteTarget([]), /explicit workspace/)
assert.throws(() => requireLiveWriteTarget(['--workspace', 'personal']), /matching confirmation flag/)
assert.throws(
  () => requireLiveWriteTarget(['--workspace', 'personal', '--confirm-live-write', 'interlink-group']),
  /does not match/,
)
assert.throws(
  () => requireLiveWriteTarget(['--workspace', 'test', '--confirm-live-write', 'test']),
  /must be "personal" or "interlink-group"/,
)
assert.equal(
  requireLiveWriteTarget(['--workspace', 'personal', '--confirm-live-write', 'personal']),
  'personal',
)
assert.equal(
  requireLiveWriteTarget(['--workspace', 'interlink-group', '--confirm-live-write', 'interlink-group']),
  'interlink-group',
)

console.log('Live-write guard checks passed.')
