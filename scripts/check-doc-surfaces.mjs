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
    ],
    forbidden: [
      /106 tools/,
      /116 tools/,
      /2 workspaces/,
      /both workspaces/,
    ],
  },
  {
    label: 'CAPABILITIES',
    path: `${root}/CAPABILITIES.md`,
    required: [
      /## Fresh Session Tool Use/,
      /## Metadata Maintenance Contract/,
      /Tool count\*\*: \d+/,
    ],
    forbidden: [
      /106 tools/,
      /116 tools/,
      /2 workspaces/,
      /both workspaces/,
    ],
  },
  {
    label: 'linear skill',
    path: '/Users/jonas/.agents/skills/linear/SKILL.md',
    optional: true,
    required: [
      /Fresh-session rule:/,
      /generated `CAPABILITIES\.md` is the human-readable index/,
      /jonas-test-workspace/,
    ],
    forbidden: [
      /both workspaces/,
      /106 tools/,
      /116 tools/,
      /custom Bun\/TS \(2 workspaces\)/,
    ],
  },
  {
    label: 'mcp-infra skill',
    path: '/Users/jonas/.agents/skills/mcp-infra/SKILL.md',
    optional: true,
    required: [
      /generated in `CAPABILITIES\.md`/,
      /generated tool count, domains, examples, and usage guidance live in `CAPABILITIES\.md`/,
    ],
    forbidden: [
      /custom Bun\/TS \(2 workspaces\)/,
      /106 tools, 15 domains/,
      /Read tests\*\*: Search, get, list operations on both workspaces/,
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
