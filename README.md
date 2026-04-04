# linear-mcp

MCP server for [Linear](https://linear.app) with **49 tools** across 13 domains. Built with Bun, TypeScript, and raw GraphQL (no SDK dependency).

Multi-workspace support, comprehensive issue/project/initiative management, views, documents, cycles, labels, reactions, and more.

## Quick start

```bash
git clone https://github.com/jonasgantner/linear-mcp.git
cd linear-mcp
bun install
```

Set your Linear API token (get one from [Linear Settings > API](https://linear.app/settings/api)):

```bash
export LINEAR_DEFAULT_TOKEN=lin_api_your_token_here
bun run start
```

The server communicates over stdio (MCP standard).

## Workspace configuration

Workspaces are auto-discovered from environment variables matching `LINEAR_<NAME>_TOKEN`:

```bash
# Single workspace
export LINEAR_DEFAULT_TOKEN=lin_api_xxx

# Multiple workspaces
export LINEAR_BIZ_TOKEN=lin_api_xxx
export LINEAR_PERSONAL_TOKEN=lin_api_yyy
```

Every tool accepts an optional `workspace` parameter. When omitted, the first workspace is used.

## Use with Claude Code

```bash
claude mcp add linear -e LINEAR_DEFAULT_TOKEN=lin_api_xxx -- bun run /path/to/linear-mcp/index.ts
```

Or add to `~/.claude.json` directly:

```json
{
  "mcpServers": {
    "linear": {
      "type": "stdio",
      "command": "bun",
      "args": ["run", "/path/to/linear-mcp/index.ts"],
      "env": {
        "LINEAR_DEFAULT_TOKEN": "lin_api_your_token_here"
      }
    }
  }
}
```

## Use with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "linear": {
      "command": "bun",
      "args": ["run", "/path/to/linear-mcp/index.ts"],
      "env": {
        "LINEAR_DEFAULT_TOKEN": "lin_api_your_token_here"
      }
    }
  }
}
```

## Tools (56)

### Issues (7)
`search_issues` / `get_issue` / `create_issue` / `update_issue` / `delete_issue` / `archive_issue` / `unarchive_issue`

### Issue Relations (2)
`create_issue_relation` / `delete_issue_relation`

### Comments (5)
`create_comment` / `update_comment` / `delete_comment` / `resolve_comment` / `unresolve_comment`

### Reactions (2)
`create_reaction` / `delete_reaction`

### Projects (8)
`search_projects` / `get_project` / `create_project` / `update_project` / `create_project_update` / `create_project_milestone` / `update_project_milestone` / `delete_project_milestone`

### Initiatives (6)
`list_initiatives` / `get_initiative` / `create_initiative` / `update_initiative` / `create_initiative_update` / `link_initiative_project`

### Documents (4)
`search_documents` / `create_document` / `update_document` / `delete_document`

### Views (6)
`list_views` / `get_view` / `create_view` / `update_view` / `delete_view` / `set_view_preferences`

### Cycles (3)
`list_cycles` / `create_cycle` / `update_cycle`

### Labels (3)
`list_labels` / `create_issue_label` / `create_project_label`

### Notifications (1)
`list_notifications`

### Teams (1)
`get_teams`

### Users (1)
`get_viewer`

### Attachments (5)
`create_attachment` / `update_attachment` / `delete_attachment` / `link_attachment_url` / `link_attachment_discord`

### Batch Operations (2)
`issue_batch_create` / `issue_batch_update`

See [CAPABILITIES.md](CAPABILITIES.md) for detailed tool reference with parameters, tested findings, and known limitations.

## Architecture

```
linear-mcp/
├── index.ts           # Entry point, MCP server, shutdown handling
├── workspaces.ts      # Workspace auto-discovery from env vars
├── client.ts          # GraphQL client, rate limiting, error handling
└── tools/
    ├── _types.ts      # ToolDef type, shared property constants
    ├── registry.ts    # Tool aggregation + MCP dispatch
    ├── issues.ts      # 7 issue tools
    ├── projects.ts    # 8 project tools
    ├── comments.ts    # 5 comment tools
    ├── initiatives.ts # 6 initiative tools
    ├── views.ts       # 6 view tools
    ├── documents.ts   # 4 document tools
    ├── cycles.ts      # 3 cycle tools
    ├── labels.ts      # 3 label tools
    ├── relations.ts   # 2 relation tools
    ├── reactions.ts   # 2 reaction tools
    ├── attachments.ts # 5 attachment tools
    ├── batch.ts       # 2 batch operation tools
    ├── notifications.ts # 1 notification tool
    ├── teams.ts       # 1 team tool
    └── users.ts       # 1 user tool
```

Design choices:
- **Raw GraphQL** via `fetch`, no `@linear/sdk`. Avoids SDK version coupling and auth quirks.
- **Single dependency**: `@modelcontextprotocol/sdk` only.
- **Per-workspace rate limiting**: 250ms minimum interval between requests.
- **Orphan prevention**: PPID watchdog kills the server if the parent process dies.

## License

MIT
