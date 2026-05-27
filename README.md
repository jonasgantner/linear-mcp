# Linear MCP

Custom Bun/TypeScript MCP server for Linear, backed by raw GraphQL and used through the local MCP control plane.

- Active local source: `/Users/jonas/.agents/mcp/servers/linear`
- Workspaces: `biz` and `personal`
- Tools: 106
- Auth: `LINEAR_BIZ_TOKEN` and `LINEAR_PERSONAL_TOKEN`
- Full tool reference: [CAPABILITIES.md](CAPABILITIES.md)

## Setup

```bash
bun install
cp .env.example .env
bun run start
```

The local production launch path uses `/Users/jonas/.agents/mcp/wrappers/linear.sh`, which loads tokens through the neutral MCP wrapper layer. The smoke scripts in `package.json` assume that local control-plane layout.

## Scripts

```bash
bun run build
bun run smoke:tools
bun run smoke:views
```

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
