import assert from 'node:assert/strict'
import { discoverWorkspaces, resolveWorkspace } from '../workspaces.js'

const workspaces = discoverWorkspaces({
  LINEAR_INTERLINK_GROUP_TOKEN: 'interlink-group-token',
  LINEAR_PERSONAL_TOKEN: 'personal-token',
})

assert.deepEqual(workspaces, [
  { name: 'interlink-group', token: 'interlink-group-token' },
  { name: 'personal', token: 'personal-token' },
])
assert.deepEqual(discoverWorkspaces({ UNRELATED_TOKEN: 'ignored-token' }), [])

process.env.LINEAR_INTERLINK_GROUP_TOKEN = 'interlink-group-token'
process.env.LINEAR_PERSONAL_TOKEN = 'personal-token'

assert.equal(resolveWorkspace().name, 'interlink-group')
assert.equal(resolveWorkspace('personal').name, 'personal')
assert.throws(
  () => resolveWorkspace('biz'),
  /Workspace "biz" not found\. Available: interlink-group, personal/,
)

console.log('Workspace routing checks passed.')
