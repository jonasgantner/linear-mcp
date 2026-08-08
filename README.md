# Linear MCP

Multi-workspace MCP server for Linear, built with Bun/TypeScript and raw GraphQL.

It covers issues, projects, initiatives, documents, comments, views, templates, notifications, attachments, and files, with complete comment readback, authenticated private-file handling, validated visual metadata, and MCP tool annotations. See [CAPABILITIES.md](CAPABILITIES.md) for the generated tool reference.

- Active local source: `/Users/jonas/.agents/mcp/servers/linear`
- Workspaces: `interlink-group` and `personal`
- Auth: `LINEAR_INTERLINK_GROUP_TOKEN` and `LINEAR_PERSONAL_TOKEN`
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

Both workspaces use Jonas's user credentials, so Linear comments and documents appear as Jonas.

## Scripts

```bash
bun run prepare:repo
bun run verify
bun run smoke:tools
bun run smoke:tools:local
bun run smoke:views
bun run smoke:comments -- --workspace personal --confirm-live-write personal
bun run smoke:files -- --workspace interlink-group --confirm-live-write interlink-group
```

Use `bun run prepare:repo` before committing source changes. It refreshes the generated capabilities reference, then runs the normal local verification path. GitHub CI runs docs, build, and credential-free tool discovery; live Linear calls still depend on local credentials and the local MCP wrapper layout.

Live-write tests are opt-in and have no workspace default. Each run must pass an explicit `personal` or `interlink-group` target and repeat that exact value in `--confirm-live-write`. These narrow tests use unique fixture names, delete their current-run artifacts in `finally`, and exit nonzero if cleanup fails. Normal CI and verification remain unit/read-only by default.

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
