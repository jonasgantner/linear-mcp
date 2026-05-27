import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getToolInventory } from '../tools/registry.js'

type JsonObject = Record<string, unknown>

const outputPath = fileURLToPath(new URL('../CAPABILITIES.md', import.meta.url))
const checkOnly = process.argv.includes('--check')

const domainTitles: Record<string, string> = {
  users: 'Users',
  teams: 'Teams',
  issues: 'Issues',
  'issue-relations': 'Issue Relations',
  comments: 'Comments',
  reactions: 'Reactions',
  projects: 'Projects',
  cycles: 'Cycles',
  labels: 'Labels',
  initiatives: 'Initiatives',
  documents: 'Documents',
  views: 'Views',
  notifications: 'Notifications',
  attachments: 'Attachments',
  files: 'Files',
  batch: 'Batch Operations',
  templates: 'Templates',
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {}
}

function escapeCell(value: unknown): string {
  return String(value ?? '-')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim() || '-'
}

function requiredParams(inputSchema: JsonObject): string {
  const required = Array.isArray(inputSchema.required) ? inputSchema.required : []
  if (required.length === 0) return '-'
  return required.map(name => `\`${String(name)}\``).join(', ')
}

function inputFieldCount(inputSchema: JsonObject): number {
  return Object.keys(asObject(inputSchema.properties)).length
}

function hasWorkspace(inputSchema: JsonObject): boolean {
  return Object.prototype.hasOwnProperty.call(asObject(inputSchema.properties), 'workspace')
}

function hasPagination(inputSchema: JsonObject): boolean {
  const props = asObject(inputSchema.properties)
  return Object.prototype.hasOwnProperty.call(props, 'first') && Object.prototype.hasOwnProperty.call(props, 'after')
}

function render(): string {
  const tools = getToolInventory()
  const domains = [...new Set(tools.map(tool => tool.domain ?? 'uncategorized'))]
  const workspaceTools = tools.filter(tool => hasWorkspace(tool.inputSchema)).length
  const paginatedTools = tools.filter(tool => hasPagination(tool.inputSchema)).length

  const lines: string[] = [
    '# Linear MCP Server - Generated Capabilities',
    '',
    '<!-- GENERATED FILE: run `bun run docs:capabilities` from this server directory. Do not hand-edit. -->',
    '',
    `**Server source**: \`/Users/jonas/.agents/mcp/servers/linear\``,
    `**Tool count**: ${tools.length}`,
    `**Workspace-aware tools**: ${workspaceTools}/${tools.length}`,
    `**Paginated tools**: ${paginatedTools}`,
    '',
    '## Source Of Truth',
    '',
    '- Runtime tool names, descriptions, schemas, domains, side effects, and feature gates live in `tools/*.ts` and `tools/registry.ts`.',
    '- This file is generated from the live registry metadata.',
    '- Agent operating policy lives in `/Users/jonas/.agents/skills/linear/SKILL.md`.',
    '- Workspace state such as team IDs, workflow states, labels, project statuses, templates, and custom views must be queried live via the MCP.',
    '',
    '## Discovery Model',
    '',
    '1. Use MCP tool discovery first; the server publishes each tool name, description, and JSON input schema at runtime.',
    '2. Use this file for a compact human-readable index and drift checks.',
    '3. Use live Linear reads for workspace-specific IDs and configuration.',
    '4. Keep detailed behavior near the code path that implements it, then regenerate this file.',
    '',
    'Useful live-discovery tools: `get_viewer`, `get_teams`, `list_labels`, `list_project_statuses`, `list_templates`, `list_views`, `search_projects`, `list_initiatives`.',
    '',
    '## Domain Index',
    '',
    '| Domain | Tools | Read | Write | Upload | Delete | Feature-gated |',
    '|---|---:|---:|---:|---:|---:|---:|',
  ]

  for (const domain of domains) {
    const domainTools = tools.filter(tool => (tool.domain ?? 'uncategorized') === domain)
    const counts = {
      read: domainTools.filter(tool => tool.sideEffect === 'read').length,
      write: domainTools.filter(tool => tool.sideEffect === 'write').length,
      upload: domainTools.filter(tool => tool.sideEffect === 'upload').length,
      delete: domainTools.filter(tool => tool.sideEffect === 'delete').length,
      gated: domainTools.filter(tool => tool.featureGate).length,
    }
    lines.push(`| ${escapeCell(domainTitles[domain] ?? domain)} | ${domainTools.length} | ${counts.read} | ${counts.write} | ${counts.upload} | ${counts.delete} | ${counts.gated} |`)
  }

  for (const domain of domains) {
    const domainTools = tools.filter(tool => (tool.domain ?? 'uncategorized') === domain)
    lines.push(
      '',
      `## ${domainTitles[domain] ?? domain}`,
      '',
      `Source files: ${[...new Set(domainTools.map(tool => tool.sourceFile).filter(Boolean))].map(file => `\`${file}\``).join(', ')}`,
      '',
      '| Tool | Effect | Required params | Input fields | Feature gate | Description |',
      '|---|---|---|---:|---|---|',
    )
    for (const tool of domainTools) {
      lines.push([
        `\`${tool.name}\``,
        escapeCell(tool.sideEffect),
        requiredParams(tool.inputSchema),
        String(inputFieldCount(tool.inputSchema)),
        escapeCell(tool.featureGate),
        escapeCell(tool.description),
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
    }
  }

  lines.push(
    '',
    '## Runtime Notes',
    '',
    '- `workspace` selects `biz` or `personal` where the tool schema exposes it; `biz` is the default.',
    '- Prefer archive/unarchive tools over hard-delete tools except for disposable test records.',
    '- Binary/local file uploads use the file tools. URL/resource cards use attachment tools.',
    '- Workspace-level views omit `teamId` and use shared organization preferences.',
    '- Project statuses, labels, templates, and views are workspace-level unless a tool call explicitly scopes them.',
  )

  return `${lines.join('\n')}\n`
}

const next = render()

if (checkOnly) {
  const current = readFileSync(outputPath, 'utf8')
  if (current !== next) {
    process.stderr.write('CAPABILITIES.md is out of date. Run `bun run docs:capabilities`.\n')
    process.exit(1)
  }
  process.stderr.write('CAPABILITIES.md is up to date.\n')
} else {
  writeFileSync(outputPath, next)
  process.stderr.write(`Wrote ${outputPath}\n`)
}
