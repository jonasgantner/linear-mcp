# Linear MCP

Custom Bun/TypeScript MCP server for Linear, backed by raw GraphQL and used through the local MCP control plane.

- Active local source: `/Users/jonas/.agents/mcp/servers/linear`
- Workspaces: `biz` and `personal`
- Auth: `LINEAR_BIZ_TOKEN` and `LINEAR_PERSONAL_TOKEN`
- Generated tool reference: [CAPABILITIES.md](CAPABILITIES.md)

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
```

Use `bun run prepare:repo` before committing source changes. It refreshes the generated capabilities reference, then runs the normal local verification path. GitHub CI runs docs, build, and credential-free tool discovery; live Linear calls still depend on local credentials and the local MCP wrapper layout.

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
