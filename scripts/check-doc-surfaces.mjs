import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname)

const surfaces = [
  {
    label: 'README',
    path: `${root}/README.md`,
    required: [
      /Fresh sessions should use one source-of-truth chain:/,
      /Do not copy tool tables into skills, README sections, or Linear comments\./,
      /Workspaces: `interlink-group` and `personal`/,
      /Live-write tests are opt-in and have no workspace default\./,
      /## Archive and trash/,
      /30 days/,
    ],
    forbidden: [
      /106 tools/,
      /116 tools/,
      /LINEAR[_]TEST/,
      /Codex[ ]Test/,
      /linear[-]app[-]actor[-]test/,
      /Permanently delete an issue\./,
      /Archive a project\. This uses Linear projectDelete/,
    ],
  },
  {
    label: 'CAPABILITIES',
    path: `${root}/CAPABILITIES.md`,
    required: [
      /## Fresh Session Tool Use/,
      /## Metadata Maintenance Contract/,
      /Tool count\*\*: \d+/,
      /## Archive And Trash Lifecycle/,
      /`archive_project` was removed and replaced by `delete_project`/,
      /No public GraphQL cycle-unarchive mutation/,
    ],
    forbidden: [
      /106 tools/,
      /116 tools/,
      /LINEAR[_]TEST/,
      /Codex[ ]Test/,
      /`TEST[-]`/,
      /Permanently delete an issue\./,
      /Archive a project\. This uses Linear projectDelete/,
    ],
  },
  {
    label: 'linear skill',
    path: '/Users/jonas/.agents/skills/linear/SKILL.md',
    optional: true,
    required: [
      /Fresh-session rule:/,
      /generated `CAPABILITIES\.md` is the human-readable index/,
      /\| `personal` \| Personal tasks/,
      /\| `interlink-group` \| Business operations/,
      /recoverable trash/,
      /permanent deletion is not exposed/,
    ],
    forbidden: [
      /106 tools/,
      /116 tools/,
      /\| `test` \|/,
      /`TEST[-]`/,
      /Hard delete only when Jonas explicitly asks to delete\./,
    ],
  },
  {
    label: 'mcp-infra skill',
    path: '/Users/jonas/.agents/skills/mcp-infra/SKILL.md',
    optional: true,
    required: [
      /generated in `CAPABILITIES\.md`/,
      /generated tool count, domains, examples, and usage guidance live in `CAPABILITIES\.md`/,
      /explicit `personal` or `interlink-group` target/,
    ],
    forbidden: [
      /106 tools, 15 domains/,
      /designated test workspace\/account/,
    ],
  },
  {
    label: 'AGENTS guidance',
    path: '/Users/jonas/.codex/AGENTS.md',
    optional: true,
    required: [
      /Audits, reviews, comparisons, research, and "check options" are advisory/,
      /A later decision can be recorded separately without rewriting the original artifact\./,
    ],
  },
]

const failures = []

for (const surface of surfaces) {
  if (!existsSync(surface.path)) {
    if (surface.optional) {
      process.stderr.write(`Skipping optional ${surface.label}: ${surface.path}\n`)
      continue
    }
    failures.push(`${surface.label}: missing ${surface.path}`)
    continue
  }

  const text = readFileSync(surface.path, 'utf8')
  for (const pattern of surface.required ?? []) {
    if (!pattern.test(text)) failures.push(`${surface.label}: missing required pattern ${pattern}`)
  }
  for (const pattern of surface.forbidden ?? []) {
    if (pattern.test(text)) failures.push(`${surface.label}: forbidden stale pattern ${pattern}`)
  }
}

if (failures.length > 0) {
  process.stderr.write(`Documentation surface check failed:\n${failures.map(failure => `- ${failure}`).join('\n')}\n`)
  process.exit(1)
}

process.stderr.write('Documentation surface check passed.\n')
