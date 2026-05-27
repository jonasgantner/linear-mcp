# Linear MCP

Custom Bun/TypeScript MCP server for Linear, backed by raw GraphQL and used through the local MCP control plane.

- Active local source: `/Users/jonas/.agents/mcp/servers/linear`
- Workspaces: `biz`, `personal`, and `jonas-test-workspace` (`test` alias)
- Plan levels: `biz` and `personal` are Basic; `jonas-test-workspace` is Free.
- Auth: `LINEAR_BIZ_TOKEN`, `LINEAR_PERSONAL_TOKEN`, and `LINEAR_TEST_WORKSPACE_TOKEN`
- Generated tool reference: [CAPABILITIES.md](CAPABILITIES.md)

## Agent Usage

Fresh sessions should use one source-of-truth chain:

1. Runtime MCP tool discovery for callable names, descriptions, and schemas.
2. [CAPABILITIES.md](CAPABILITIES.md) for the generated human-readable index, examples, and tool-choice guidance.
3. `/Users/jonas/.agents/skills/linear/SKILL.md` for workspace routing and operating policy.
4. Live MCP reads for IDs and current Linear workspace state.

Do not copy tool tables into skills, README sections, or Linear comments. If tool behavior changes, update the implementing `ToolDef` metadata/examples under `tools/`, regenerate `CAPABILITIES.md`, and keep the skill focused on policy rather than a second reference.

## Setup

```bash
bun install
cp .env.example .env
bun run start
```

The local production launch path uses `/Users/jonas/.agents/mcp/wrappers/linear.sh`, which loads tokens through the neutral MCP wrapper layer. The smoke scripts in `package.json` assume that local control-plane layout.

## Scripts

```bash
bun run prepare:repo
bun run verify
bun run smoke:tools
bun run smoke:tools:local
bun run smoke:views
bun run smoke:live -- --workspace jonas-test-workspace --scenario comments
bun run smoke:live -- --workspace biz --scenario discord --discord-url https://discord.com/channels/<guild>/<channel>/<message>
bun run seed:test-workspace
```

Use `bun run prepare:repo` before committing source changes. It refreshes the generated capabilities reference, then runs the normal local verification path. GitHub CI runs docs, build, and credential-free tool discovery; live Linear calls still depend on local credentials and the local MCP wrapper layout.

`bun run smoke:live` is opt-in and mutates Linear. It defaults to `jonas-test-workspace` and also accepts `--workspace personal` or `--workspace biz`. It creates durable sandbox anchors named `Linear MCP Sandbox`, creates disposable fixtures named `MCP Smoke <domain> <timestamp>`, tracks created IDs, and cleans current-run fixtures in `finally`. Supported scenarios are `favorites`, `labels`, `duplicate`, `organize`, `comments`, `views`, `icons`, `notifications`, `subscriptions`, `templates`, `discord`, and `all`. The `discord` scenario is intentionally not part of `all` because it needs `--discord-url` and the biz Discord integration. The script warns about stale `MCP Smoke` fixtures before it starts; review those warnings separately from current-run cleanup results.

`bun run seed:test-workspace` is also mutating and intentionally durable. It targets `jonas-test-workspace` by default, creates a fleshed-out MCP capability lab, and writes a local report under `reports/`.

## Layout

```text
index.ts
workspaces.ts
client.ts
tools/
  registry.ts
  issues.ts
  projects.ts
  initiatives.ts
  views.ts
  templates.ts
  files.ts
  attachments.ts
  ...
```
