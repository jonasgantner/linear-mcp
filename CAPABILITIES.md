# Linear MCP Server — Capabilities Reference

**Runtime**: Bun/TypeScript, raw GraphQL
**Tools**: 49
**Workspaces**: Auto-discovered from `LINEAR_<NAME>_TOKEN` env vars. Every tool accepts optional `workspace` param.
**Auth**: PAT via `Authorization` header (no Bearer prefix)
**Throttle**: 250ms per workspace

---

## Tools by Domain

### Issues (7 tools)

| Tool | Description | Key params |
|---|---|---|
| `search_issues` | Search/filter issues | `state`, `assignee` ("me"), `label`, `team`, `project`, `priority` (0-4), `query`, `filter` (raw IssueFilter) |
| `get_issue` | Full issue details | `id` (UUID or identifier like "SPE-123") |
| `create_issue` | Create issue | `teamId`*, `title`*, `description`, `priority`, `stateId`, `assigneeId`, `labelIds`, `cycleId`, `projectId`, `dueDate`, `estimate`, `parentId` |
| `update_issue` | Update issue fields | `id`*, plus any field. Supports `addedLabelIds`, `removedLabelIds`, `projectMilestoneId`, `teamId` (move between teams) |
| `delete_issue` | Permanently delete | `id`* |
| `archive_issue` | Soft archive | `id`* |
| `unarchive_issue` | Restore archived | `id`* |

**Tested findings:**
- Issues do NOT have `startDate` (only `dueDate`). Projects have `startDate`.
- `addedLabelIds` and `removedLabelIds` work for incremental label changes.
- Identifiers like `SPE-123` work in `id` param for get/update/delete.
- Sub-issues via `parentId` on create. Visible in parent's `children.nodes`.

### Issue Relations (2 tools)

| Tool | Description | Key params |
|---|---|---|
| `create_issue_relation` | Create relation | `type`* (blocks/duplicate/related/similar), `issueId`*, `relatedIssueId`* |
| `delete_issue_relation` | Delete relation | `id`* |

**Tested findings:**
- All 4 relation types work: blocks, duplicate, related, similar.
- `get_issue` returns `relations` (outgoing) and `inverseRelations` (incoming).
- Creating a duplicate relation may auto-remove conflicting relations on the same issues.

### Comments (5 tools)

| Tool | Description | Key params |
|---|---|---|
| `create_comment` | Comment on issue, project update, or initiative update | `body`*, plus one target: `issueId`, `projectUpdateId`, or `initiativeUpdateId`. `parentId` for threaded replies. |
| `update_comment` | Edit comment | `id`*, `body`* |
| `delete_comment` | Delete comment | `id`* |
| `resolve_comment` | Mark resolved | `id`* |
| `unresolve_comment` | Mark unresolved | `id`* |

**Tested findings:**
- Markdown in comment body renders correctly.
- Resolve/unresolve toggle works. Field is `resolvingUser` (not `resolvedUser`).
- Can comment on project updates (`projectUpdateId`) and initiative updates (`initiativeUpdateId`).
- Only one top-level comment thread per update. Use `parentId` for replies within a thread.
- Threaded replies via `parentId` pointing to an existing comment UUID.

### Reactions (2 tools)

| Tool | Description | Key params |
|---|---|---|
| `create_reaction` | Add emoji reaction | `emoji`* (e.g. "+1", "heart", "rocket"), plus one target: `commentId`, `issueId`, `projectUpdateId`, or `initiativeUpdateId` |
| `delete_reaction` | Remove reaction | `id`* |

**Tested findings:**
- Emoji format is plain names: `+1`, `heart`, `rocket`, `tada`. Not Unicode, not `:colon:` format.
- Can react to comments, issues, project updates, and initiative updates.

### Projects (8 tools)

| Tool | Description | Key params |
|---|---|---|
| `search_projects` | Search/filter projects | `name`, `state` (planned/started/paused/completed/canceled), `filter` |
| `get_project` | Full project details | `id`*. Returns milestones, updates, members, issues. |
| `create_project` | Create project | `name`*, `teamIds`*, `description`, `state`, `leadId`, `startDate`, `targetDate` |
| `update_project` | Update project | `id`*, `state`, `icon`, `color`, `priority`, `leadId`, `memberIds`, `labelIds`, `startDate`, `targetDate` |
| `create_project_update` | Post status update | `projectId`*, `body` (markdown), `health` (onTrack/atRisk/offTrack) |
| `create_project_milestone` | Create milestone | `projectId`*, `name`*, `description`, `targetDate` |
| `update_project_milestone` | Update milestone | `id`*, `name`, `description`, `targetDate` |
| `delete_project_milestone` | Delete milestone | `id`* |

**Tested findings:**
- Icon format is Slack-style `:emoji_name:` (e.g. `:rocket:`, `:test_tube:`). NOT Unicode emoji.
- Priority works (0-4 scale, same as issues).
- `get_project` returns `projectMilestones` and `projectUpdates` in response.
- Project deletion is NOT available via API. Use `update_project(state: "canceled")` to close.

### Cycles (3 tools)

| Tool | Description | Key params |
|---|---|---|
| `list_cycles` | List cycles | `teamId`, `type` (current/next/previous), `filter` |
| `create_cycle` | Create cycle | `teamId`*, `startsAt`* (ISO datetime), `endsAt`*, `name`, `description` |
| `update_cycle` | Update cycle | `id`*, `name`, `description`, `startsAt`, `endsAt` |

**Tested findings:**
- Add issues to cycles via `update_issue(cycleId: ...)`.
- Cycle issues visible in `list_cycles` response under `issues.nodes`.
- `type: "current"` filters by `startsAt <= now <= endsAt`.
- Cycle deletion not available via API. Use future dates to avoid polluting active sprints.

### Labels (3 tools)

| Tool | Description | Key params |
|---|---|---|
| `list_labels` | List issue labels | `teamId` (filter), `filter` (raw) |
| `create_issue_label` | Create issue label | `name`*, `description`, `color`, `isGroup` (true=parent), `parentId`, `teamId` |
| `create_project_label` | Create project label | `name`*, `description`, `color`, `isGroup`, `parentId` |

**Tested findings:**
- Label groups: create with `isGroup: true`, then children with `parentId`.
- Team-scoped labels: pass `teamId`. Omit for workspace-wide.
- Labels with descriptions render in Linear UI.
- Label deletion may not be available via API (use `issueLabelRetire` if needed).

### Initiatives (6 tools)

| Tool | Description | Key params |
|---|---|---|
| `list_initiatives` | List all initiatives | pagination |
| `get_initiative` | Get with projects + updates | `id`* |
| `create_initiative` | Create initiative | `name`*, `description`, `status` (Planned/Active/Completed), `ownerId`, `color`, `targetDate` |
| `update_initiative` | Update initiative | `id`*, `name`, `status`, `color`, `targetDate`, `ownerId` |
| `link_initiative_project` | Link project | `initiativeId`*, `projectId`* |
| `create_initiative_update` | Post status update | `initiativeId`*, `body` (markdown), `health` (onTrack/atRisk/offTrack) |

**Tested findings:**
- Status transitions work: Planned → Active → Completed.
- Multiple projects can be linked to one initiative.
- Initiative updates field is `initiativeUpdates` (not `updates`).
- Can react to initiative updates via `create_reaction(initiativeUpdateId: ...)`.

### Documents (4 tools)

| Tool | Description | Key params |
|---|---|---|
| `create_document` | Create document | `title`*, `content` (markdown), `projectId?`, `initiativeId?`, `teamId?`, `icon`, `color` |
| `update_document` | Update document | `id`*, `title`, `content`, `icon`, `color` |
| `search_documents` | Search/list documents | `projectId`, `initiativeId`, `filter` |
| `delete_document` | Delete document | `id`* |

**Tested findings:**
- Documents can be linked to projects, initiatives, or teams (mutually exclusive).
- Standalone documents (no link) may also work.
- Full markdown content supported.
- Search by project returns only docs linked to that project.

### Custom Views (6 tools)

| Tool | Description | Key params |
|---|---|---|
| `list_views` | List saved custom views | pagination |
| `get_view` | Get view with filter config | `id`* |
| `create_view` | Create saved view/filter | `name`*, `description`, `icon`, `color`, `teamId?`, `projectId?`, `initiativeId?`, `shared`, `filterData` (IssueFilter), `projectFilterData` (ProjectFilter) |
| `update_view` | Update view | `id`*, `name`, `description`, `filterData`, `projectFilterData`, `shared` |
| `delete_view` | Delete view | `id`* |
| `set_view_preferences` | Set layout, grouping, ordering, display fields | `customViewId`*, `preferences` (object), `type` ("organization" or "user") |

**Tested findings:**
- `filterData` accepts full IssueFilter objects (e.g. `{ assignee: { isMe: { eq: true } }, priority: { in: [1,2] } }`).
- Complex filters work: `{ or: [{ state: { name: { eq: "Waiting" } } }, { labels: { name: { eq: "blocked-external" } } }] }`.
- Cycle filter: `{ cycle: { isActive: { eq: true } } }`.
- Icons use `:emoji_name:` format (same as projects).
- Views are personal by default. Set `shared: true` to share with workspace.
- Scoping to team/project/initiative controls where the view appears in Linear's sidebar.
- **View preferences** (layout, grouping, ordering) are set separately via `set_view_preferences` after creating the view.
- Issue view layout options: `layout` ("list"/"board"), `issueGrouping` ("status"/"priority"/"assignee"/"label"/"project"/"cycle"/"noGrouping"), `issueSubGrouping` (same options), `viewOrdering` ("priority"/"createdAt"/"updatedAt"/"manual").
- Project view layout options: `projectLayout` ("list"/"board"/"timeline"), `projectGrouping` ("status"/"lead"/"noGrouping"), `projectViewOrdering` ("manual"/"createdAt"/"updatedAt").
- Display fields toggled via boolean flags: `fieldPriority`, `fieldAssignee`, `fieldDueDate`, `fieldLabels`, `fieldProject`, `fieldMilestone`, `fieldTimeInCurrentStatus`, etc.
- `type: "organization"` makes preferences shared (visible to all workspace members). `type: "user"` for personal preferences.

### Notifications (1 tool)

| Tool | Description | Key params |
|---|---|---|
| `list_notifications` | Inbox notifications | `includeArchived` (bool), pagination. Returns `unreadCount` + notification nodes. |

**Tested findings:**
- Returns unread count alongside notification list.
- Notification types include: `issueStatusChanged`, `issueNewComment`, `issueCommentReaction`, `issuePriorityUrgent`.
- `IssueNotification` nodes include `issue`, `comment`, `actor` fields.

### Teams (1 tool)

| Tool | Description | Key params |
|---|---|---|
| `get_teams` | List teams + members | `include` (array: "states", "labels"). Fetches states/labels via separate queries to avoid complexity limits. |

### Users (1 tool)

| Tool | Description | Key params |
|---|---|---|
| `get_viewer` | Authenticated user info | Returns `id`, `name`, `email`, `organization` |

---

## Common Patterns

### Pagination
All list/search tools accept `first` (default 50, max 250) and `after` (cursor from `pageInfo.endCursor`).

### Filtering
- `search_issues`: convenience params (`state`, `assignee`, `label`, `team`, `project`, `priority`, `query`) or raw `filter` object
- `search_projects`: `name`, `state`, or raw `filter`
- `list_cycles`: `teamId`, `type` (current/next/previous), or raw `filter`
- `search_documents`: `projectId`, `initiativeId`, or raw `filter`

### Collapsible Sections (Linear Markdown)
Linear does NOT support HTML `<details>/<summary>`. Use `+++` syntax:
```
+++ Section title
Content (initially hidden)
+++
```

### Icon Format
Projects and initiatives use Slack-style emoji codes: `:rocket:`, `:wrench:`, `:test_tube:`.
Reactions use plain names: `+1`, `heart`, `rocket`.

---

## Known Limitations

1. **No `startDate` on issues** — only `dueDate`. Projects have `startDate`.
2. **No project deletion** — only `update_project(state: "canceled")`.
3. **No cycle deletion** — cycles persist. Use future dates for test cycles.
4. **No label deletion** — `issueLabelRetire` exists but not exposed. Labels persist.
5. **No issue templates** — templates are UI-only, not exposed via GraphQL API.
6. **No notification management** — `notificationArchive`, `notificationMarkReadAll` exist but not yet implemented.
7. **No workflow state management** — states are read via `get_teams(include: ["states"])` but cannot be created/updated.
8. **No bulk operations** — `issueBatchCreate`/`issueBatchUpdate` exist but not yet implemented.
9. **No attachments** — file upload/link not yet implemented.
10. **Initiative description max 255 chars** — use `content` field for longer rich body (markdown).
11. **One comment thread per update** — project/initiative updates allow only one top-level comment. Use `parentId` for replies within that thread.
12. **Project description field is `content`** — not `description` on `ProjectUpdateInput`. Same for initiatives.

---

## Schema Fixes Applied During Testing

| Fix | Issue | Resolution |
|---|---|---|
| `startDate` on issues | Field doesn't exist on `IssueCreateInput` or `IssueUpdateInput` | Removed from both schemas |
| `resolvedUser` on comments | Field is `resolvingUser` | Fixed in resolve mutation |
| `updates` on initiatives | Field is `initiativeUpdates` | Fixed in get_initiative query |
| `completedScopeCount` on cycles | Field doesn't exist | Removed from query |
| `scopeCount` on cycles | Field doesn't exist | Removed from query |
| Icon format | Projects reject Unicode emoji | Use `:emoji_name:` (Slack-style) |
| Emoji format (reactions) | Different from icon format | Use plain names: `+1`, `heart` |
| `link_initiative_project` | Mutation uses `input` object, not direct args | Fixed to wrap in `{ input: { ... } }` |
| `update_project` description | Field is `content`, not `description` | Fixed schema |
| `update_initiative` description | `description` max 255 chars, `content` for rich body | Added `content` field to schema |
| `create_comment` scope | Only supported `issueId` | Added `projectUpdateId`, `initiativeUpdateId`, `parentId` |
| Orphan prevention | Bun spins at 100% CPU on broken stdin | Three-layer defense: stdin events + 2s timeout + PPID watchdog (SIGKILL) |
| Stdin reaper (Python servers) | `read(4096)` blocked on MCP messages | Changed to `readline()` (MCP = one JSON-RPC message per line) |
