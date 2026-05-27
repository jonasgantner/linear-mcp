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
  favorites: 'Favorites',
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

function renderExampleArgs(args: Record<string, unknown>): string {
  return `\`${JSON.stringify(args).replace(/`/g, '\\`')}\``
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
    '- Global Linear behavior lives in `/Users/jonas/.codex/AGENTS.md`; `/Users/jonas/.agents/skills/linear/SKILL.md` covers MCP routing, live discovery, and tool mechanics.',
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
    '## Fresh Session Tool Use',
    '',
    'When starting without recent context, follow this order:',
    '',
    '1. Pick the workspace from the issue prefix or user request: `SPE-` -> `biz`; `J-` -> `personal`; `JON-` or disposable live tests -> `jonas-test-workspace`/`test`.',
    '2. Query live IDs before writing. Use names only for search/discovery; write calls usually need UUIDs.',
    '3. Prefer readback after every write. The useful pattern is write -> `get_*`/`list_*` -> assert the changed field.',
    '4. Treat old Linear comments, screenshots, and chat summaries as leads, not source of truth.',
    '5. If a behavior is tool-specific, update the implementing `ToolDef` metadata/examples and regenerate this file instead of adding a second hand-written reference.',
    '',
    '| Need | Start With | Then Use | Watchouts |',
    '|---|---|---|---|',
    '| Workspace/user/team context | `get_viewer`, `get_teams` | `list_labels`, `list_project_statuses` | Always pass `workspace: "personal"` for J- issues; omitted workspace defaults to `biz`. |',
    '| Find or update issues | `search_issues`, `get_issue` | `create_issue`, `update_issue`, `archive_issue` | Use `archive_issue` over `delete_issue` except disposable tests; use JSON `null` for documented nullable clears. |',
    '| Issue relations and duplicates | `get_issue` | `create_issue_relation`, `mark_issue_duplicate` | Duplicate state requires a duplicate relation first; use `mark_issue_duplicate` for the full workflow. |',
    '| Comments and rich text anchors | `get_issue`, `search_documents` | `create_comment`, `resolve_comment`, `unresolve_comment` | Inline GUI anchors need `issueDescriptionId` or `documentId` plus exact `quotedText`. |',
    '| Uploaded files vs URL cards | file tools | attachment tools | Binary/local files use `upload_file` helpers; external URLs/resources use attachment tools. |',
    '| Projects, statuses, and milestones | `search_projects`, `list_project_statuses`, `get_project` | project tools, milestone tools | Project statuses are workspace-level; prefer `statusId` over status names for writes. |',
    '| Initiatives | `list_initiatives`, `get_initiative` | initiative tools and initiative-project link tools | Sub-initiatives and initiative labels are not part of the current usable surface. |',
    '| Labels | `list_labels`, `list_project_labels` | label create/update/retire/restore/delete tools | Avoid label-by-name duplication; read existing labels before creating. |',
    '| Views and filters | `list_views`, `get_view`, `check_view_schema_drift` | `create_view`, `update_view`, `set_view_preferences` | Keep team scope in top-level `teamId`; use GUI-safe filter shapes and canonical preference values. |',
    '| Templates and recurring issues | `list_templates`, `get_template` | template tools, recurring-template helpers | Deleting a recurring template stops future issues but already-created issues must be archived separately. |',
    '| Notifications/subscriptions | `list_notifications`, `get_issue` | notification tools, `subscribe_issue`, `unsubscribe_issue`, `issue_reminder` | Live notification tests can affect inbox state; keep them opt-in. |',
    '',
    '## Metadata Maintenance Contract',
    '',
    '- Runtime tool descriptions should say what the tool does, key side effects, accepted formats, and important safety constraints.',
    '- Put copyable examples in `ToolDef.examples` only when they prevent likely agent mistakes; examples appear here automatically.',
    '- Use `featureGate` for plan/integration requirements rather than burying them in prose.',
    '- Keep `/Users/jonas/.agents/skills/linear/SKILL.md` focused on routing, live discovery, and high-risk operating policy. Do not paste the tool table there.',
    '- Keep `/Users/jonas/.agents/skills/mcp-infra/SKILL.md` inventory-level; it should link to this generated file for Linear tool counts/details.',
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
    const toolsWithExamples = domainTools.filter(tool => Array.isArray(tool.examples) && tool.examples.length > 0)
    if (toolsWithExamples.length > 0) {
      lines.push('', 'Examples:', '')
      for (const tool of toolsWithExamples) {
        for (const example of tool.examples ?? []) {
          const title = example.title ? ` (${escapeCell(example.title)})` : ''
          const description = example.description ? ` - ${escapeCell(example.description)}` : ''
          lines.push(`- \`${tool.name}\`${title}: ${renderExampleArgs(example.args)}${description}`)
        }
      }
    }
  }

  lines.push(
    '',
    '## Runtime Notes',
    '',
    '- `workspace` selects `biz`, `personal`, `test`, or `jonas-test-workspace` where the tool schema exposes it; `biz` is the default.',
    '- Workspace plan levels: `biz` and `personal` are Basic; `jonas-test-workspace` is Free.',
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
