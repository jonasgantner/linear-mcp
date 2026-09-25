import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getToolInventory } from '../tools/registry.js'

const sourceFiles = [
  'projects.ts',
  'initiatives.ts',
  'issues.ts',
  'documents.ts',
  'files.ts',
  'favorites.ts',
  'notifications.ts',
] as const

const sources = new Map(sourceFiles.map(file => [
  file,
  readFileSync(new URL(`../tools/${file}`, import.meta.url), 'utf8'),
]))
const combined = [...sources.values()].join('\n')

assert.doesNotMatch(combined, /project \{ id name/, 'Project summaries must include identifier after id')
assert.doesNotMatch(combined, /projects \{ nodes \{ id name/, 'Project connection summaries must include identifier after id')
assert.doesNotMatch(combined, /initiative \{ id name/, 'Initiative summaries must include identifier after id')
assert.doesNotMatch(combined, /initiatives \{ nodes \{ id name/, 'Initiative connection summaries must include identifier after id')

const projectsSource = sources.get('projects.ts') ?? ''
assert.match(projectsSource, /id identifier name description url state/, 'Project search must return identifier')
assert.match(projectsSource, /id identifier name description content contentState url state/, 'Project detail must return identifier')
assert.match(projectsSource, /entity \{ id identifier name archivedAt/, 'Project restore readback must return identifier')

const initiativesSource = sources.get('initiatives.ts') ?? ''
assert.match(initiativesSource, /id identifier name description content url status/, 'Initiative detail must return identifier')
assert.match(initiativesSource, /id identifier name description url status/, 'Initiative list must return identifier')
assert.match(initiativesSource, /const resolvedInitiativeId = data\.initiative\.id/, 'Identifier lookup must resolve the initiative UUID for secondary reads')
assert.match(initiativesSource, /GET_INITIATIVE_COMMENTS_QUERY, \{ initiativeId: resolvedInitiativeId \}/, 'Initiative comments must use the resolved UUID')
assert.match(initiativesSource, /listInitiativeProjectLinks\(client, \{ initiativeId: resolvedInitiativeId \}\)/, 'Initiative links must use the resolved UUID')

const inventory = getToolInventory()
const byName = new Map(inventory.map(tool => [tool.name, tool]))
for (const name of ['get_project', 'get_initiative']) {
  const tool = byName.get(name)
  assert.match(tool?.description ?? '', /human-readable identifier/, `${name} must document identifier lookup`)
  const properties = tool?.inputSchema.properties as Record<string, { description?: string }> | undefined
  assert.match(properties?.id?.description ?? '', /human-readable identifier/, `${name}.id must document identifier lookup`)
}

console.log('Project and initiative identifier checks passed.')
