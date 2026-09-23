import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildIssueSearchVariables } from '../tools/issues.js'
import { getToolInventory } from '../tools/registry.js'

assert.deepEqual(buildIssueSearchVariables({}), {
  filter: undefined,
  first: 50,
  after: undefined,
  orderBy: 'updatedAt',
  includeArchived: false,
})

assert.equal(buildIssueSearchVariables({ includeArchived: true }).includeArchived, true)

assert.deepEqual(buildIssueSearchVariables({ archivedOnly: true }), {
  filter: { archivedAt: { null: false } },
  first: 50,
  after: undefined,
  orderBy: 'updatedAt',
  includeArchived: true,
})

assert.deepEqual(buildIssueSearchVariables({ archivedOnly: true, query: 'archive probe' }).filter, {
  and: [
    {
      or: [
        { title: { containsIgnoreCase: 'archive probe' } },
        { description: { containsIgnoreCase: 'archive probe' } },
      ],
    },
    { archivedAt: { null: false } },
  ],
})

const rawFilter = { team: { key: { eq: 'J' } }, priority: { eq: 3 } }
const rawSnapshot = structuredClone(rawFilter)
assert.deepEqual(buildIssueSearchVariables({ archivedOnly: true, filter: rawFilter }).filter, {
  and: [rawSnapshot, { archivedAt: { null: false } }],
})
assert.deepEqual(rawFilter, rawSnapshot, 'archivedOnly must not mutate a caller-provided raw filter')

const inventory = getToolInventory()
const byName = new Map(inventory.map(tool => [tool.name, tool]))

for (const name of ['search_issues', 'search_projects', 'list_initiatives', 'search_documents', 'list_cycles']) {
  const properties = byName.get(name)?.inputSchema.properties as Record<string, unknown> | undefined
  assert.ok(properties?.includeArchived, `${name} must publish includeArchived`)
}

const issueProperties = byName.get('search_issues')?.inputSchema.properties as Record<string, unknown>
assert.ok(issueProperties.archivedOnly, 'search_issues must publish archivedOnly')

for (const name of ['search_projects', 'list_initiatives', 'search_documents', 'list_cycles']) {
  const properties = byName.get(name)?.inputSchema.properties as Record<string, unknown> | undefined
  assert.equal(properties?.archivedOnly, undefined, `${name} must not publish unreliable archivedOnly filtering`)
}

assert.equal(byName.has('archive_project'), false, 'archive_project must be removed')
assert.equal(byName.get('delete_project')?.sideEffect, 'delete')
assert.equal(byName.get('delete_initiative')?.sideEffect, 'delete')
assert.equal(byName.get('unarchive_document')?.sideEffect, 'write')
for (const name of [
  'archive_issue',
  'unarchive_issue',
  'unarchive_project',
  'archive_initiative',
  'unarchive_initiative',
  'unarchive_document',
  'cycle_archive',
]) {
  assert.equal(byName.get(name)?.sideEffect, 'write', `${name} must remain a reversible/non-destructive write annotation`)
}
assert.equal(inventory.length, 138)

const sourceExpectations = [
  ['issues.ts', /issues\([^)]*includeArchived: \$includeArchived/, /archivedAt autoArchivedAt trashed/],
  ['projects.ts', /projects\([^)]*includeArchived: \$includeArchived/, /archivedAt autoArchivedAt trashed/],
  ['initiatives.ts', /initiatives\([^)]*includeArchived: \$includeArchived/, /archivedAt trashed/],
  ['documents.ts', /documents\([^)]*includeArchived: \$includeArchived/, /archivedAt trashed/],
  ['cycles.ts', /cycles\([^)]*includeArchived: \$includeArchived/, /archivedAt autoArchivedAt/],
] as const

for (const [file, connectionPattern, lifecyclePattern] of sourceExpectations) {
  const source = readFileSync(new URL(`../tools/${file}`, import.meta.url), 'utf8')
  assert.match(source, connectionPattern, `${file} must pass includeArchived to its GraphQL connection`)
  assert.match(source, lifecyclePattern, `${file} must request its supported lifecycle fields`)
  if (file !== 'issues.ts') {
    assert.match(source, /includeArchived: args\.includeArchived === true/, `${file} must default includeArchived to false`)
  }
}

console.log('Archive option and lifecycle tool checks passed.')
