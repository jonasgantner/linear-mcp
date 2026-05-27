# Linear MCP Server - Generated Capabilities

<!-- GENERATED FILE: run `bun run docs:capabilities` from this server directory. Do not hand-edit. -->

**Server source**: `/Users/jonas/.agents/mcp/servers/linear`
**Tool count**: 131
**Workspace-aware tools**: 131/131
**Paginated tools**: 13

## Source Of Truth

- Runtime tool names, descriptions, schemas, domains, side effects, and feature gates live in `tools/*.ts` and `tools/registry.ts`.
- This file is generated from the live registry metadata.
- Global Linear behavior lives in `/Users/jonas/.codex/AGENTS.md`; `/Users/jonas/.agents/skills/linear/SKILL.md` covers MCP routing, live discovery, and tool mechanics.
- Workspace state such as team IDs, workflow states, labels, project statuses, templates, and custom views must be queried live via the MCP.

## Discovery Model

1. Use MCP tool discovery first; the server publishes each tool name, description, and JSON input schema at runtime.
2. Use this file for a compact human-readable index and drift checks.
3. Use live Linear reads for workspace-specific IDs and configuration.
4. Keep detailed behavior near the code path that implements it, then regenerate this file.

Useful live-discovery tools: `get_viewer`, `get_teams`, `list_labels`, `list_project_statuses`, `list_templates`, `list_views`, `search_projects`, `list_initiatives`.

## Fresh Session Tool Use

When starting without recent context, follow this order:

1. Pick the workspace from the issue prefix or user request: `SPE-` -> `biz`; `J-` -> `personal`; `JON-` or disposable live tests -> `jonas-test-workspace`/`test`.
2. Query live IDs before writing. Use names only for search/discovery; write calls usually need UUIDs.
3. Prefer readback after every write. The useful pattern is write -> `get_*`/`list_*` -> assert the changed field.
4. Treat old Linear comments, screenshots, and chat summaries as leads, not source of truth.
5. If a behavior is tool-specific, update the implementing `ToolDef` metadata/examples and regenerate this file instead of adding a second hand-written reference.

| Need | Start With | Then Use | Watchouts |
|---|---|---|---|
| Workspace/user/team context | `get_viewer`, `get_teams` | `list_labels`, `list_project_statuses` | Always pass `workspace: "personal"` for J- issues; omitted workspace defaults to `biz`. |
| Find or update issues | `search_issues`, `get_issue` | `create_issue`, `update_issue`, `archive_issue` | Use `archive_issue` over `delete_issue` except disposable tests; use JSON `null` for documented nullable clears. |
| Issue relations and duplicates | `get_issue` | `create_issue_relation`, `mark_issue_duplicate` | Duplicate state requires a duplicate relation first; use `mark_issue_duplicate` for the full workflow. |
| Comments and rich text anchors | `get_issue`, `search_documents` | `create_comment`, `resolve_comment`, `unresolve_comment` | Inline GUI anchors need `issueDescriptionId` or `documentId` plus exact `quotedText`. |
| Uploaded files vs URL cards | file tools | attachment tools | Binary/local files use `upload_file` helpers; external URLs/resources use attachment tools. |
| Projects, statuses, and milestones | `search_projects`, `list_project_statuses`, `get_project` | project tools, milestone tools | Project statuses are workspace-level; prefer `statusId` over status names for writes. |
| Initiatives | `list_initiatives`, `get_initiative` | initiative tools and initiative-project link tools | Sub-initiatives and initiative labels are not part of the current usable surface. |
| Labels | `list_labels`, `list_project_labels` | label create/update/retire/restore/delete tools | Avoid label-by-name duplication; read existing labels before creating. |
| Views and filters | `list_views`, `get_view`, `check_view_schema_drift` | `create_view`, `update_view`, `set_view_preferences` | Keep team scope in top-level `teamId`; use GUI-safe filter shapes and canonical preference values. |
| Templates and recurring issues | `list_templates`, `get_template` | template tools, recurring-template helpers | Deleting a recurring template stops future issues but already-created issues must be archived separately. |
| Notifications/subscriptions | `list_notifications`, `get_issue` | notification tools, `subscribe_issue`, `unsubscribe_issue`, `issue_reminder` | Live notification tests can affect inbox state; keep them opt-in. |

## Metadata Maintenance Contract

- Runtime tool descriptions should say what the tool does, key side effects, accepted formats, and important safety constraints.
- Put copyable examples in `ToolDef.examples` only when they prevent likely agent mistakes; examples appear here automatically.
- Use `featureGate` for plan/integration requirements rather than burying them in prose.
- Keep `/Users/jonas/.agents/skills/linear/SKILL.md` focused on routing, live discovery, and high-risk operating policy. Do not paste the tool table there.
- Keep `/Users/jonas/.agents/skills/mcp-infra/SKILL.md` inventory-level; it should link to this generated file for Linear tool counts/details.

## Domain Index

| Domain | Tools | Read | Write | Upload | Delete | Feature-gated |
|---|---:|---:|---:|---:|---:|---:|
| Users | 1 | 1 | 0 | 0 | 0 | 0 |
| Teams | 2 | 1 | 1 | 0 | 0 | 0 |
| Issues | 11 | 3 | 7 | 0 | 1 | 0 |
| Projects | 25 | 4 | 19 | 0 | 2 | 0 |
| Comments | 8 | 3 | 4 | 0 | 1 | 0 |
| Cycles | 4 | 1 | 3 | 0 | 0 | 0 |
| Labels | 14 | 4 | 8 | 0 | 2 | 0 |
| Initiatives | 14 | 3 | 11 | 0 | 0 | 0 |
| Notifications | 7 | 2 | 5 | 0 | 0 | 0 |
| Issue Relations | 3 | 0 | 2 | 0 | 1 | 0 |
| Reactions | 2 | 0 | 1 | 0 | 1 | 0 |
| Documents | 5 | 2 | 2 | 0 | 1 | 0 |
| Favorites | 4 | 1 | 2 | 0 | 1 | 0 |
| Views | 7 | 3 | 3 | 0 | 1 | 0 |
| Files | 10 | 0 | 0 | 10 | 0 | 0 |
| Attachments | 5 | 0 | 4 | 0 | 1 | 1 |
| Batch Operations | 2 | 0 | 2 | 0 | 0 | 0 |
| Templates | 7 | 2 | 4 | 0 | 1 | 0 |

## Users

Source files: `tools/users.ts`

| Tool | Effect | Required params | Input fields | Feature gate | Description |
|---|---|---|---:|---|---|
| `get_viewer` | read | - | 1 | - | Get the authenticated user and organization info for a workspace. |

## Teams

Source files: `tools/teams.ts`

| Tool | Effect | Required params | Input fields | Feature gate | Description |
|---|---|---|---:|---|---|
| `get_teams` | read | - | 2 | - | List all teams in the workspace with their members. Use "include" to also fetch workflow states and/or labels (separate queries to avoid complexity limits). |
| `update_team` | write | `id` | 19 | - | Update team settings: cycle config (start day, duration, auto-assign), estimate config (type, extended, allow zero, default), triage. issueEstimationType accepts: notUsed, exponential, fibonacci, linear, tShirt. defaultIssueEstimate is API-capped to 0 or 1. |

## Issues

Source files: `tools/issues.ts`

| Tool | Effect | Required params | Input fields | Feature gate | Description |
|---|---|---|---:|---|---|
| `search_issues` | read | - | 12 | - | Search and filter issues. Supports convenience params (state, assignee, label, team, project, priority, query) or a raw IssueFilter object for advanced filtering. |
| `get_issue` | read | `id` | 2 | - | Get a single issue by ID or identifier (e.g. "SPE-123"). Returns full details including comments, children, and relations. |
| `create_issue` | write | `teamId`, `title` | 15 | - | Create a new issue. Requires teamId and title at minimum. Supports the same routine organization fields as update_issue, including projectMilestoneId and subscriberIds. |
| `update_issue` | write | `id` | 20 | - | Update an existing issue. Pass the issue ID and any fields to change. Nullable fields that Linear accepts can be cleared with raw JSON null: assigneeId, cycleId, projectId, projectMilestoneId, parentId, dueDate, estimate, and snoozedUntilAt. |
| `list_issue_subscribers` | read | `id` | 4 | - | List subscribers/watchers on an issue. Use this before replacing subscriberIds directly. |
| `subscribe_issue` | write | `id` | 3 | - | Subscribe/watch an issue by adding a user to its subscriberIds. Omits userId to subscribe the authenticated Linear user. Idempotent: keeps existing subscribers. |
| `unsubscribe_issue` | write | `id` | 3 | - | Unsubscribe/unwatch an issue by removing a user from its subscriberIds. Omits userId to unsubscribe the authenticated Linear user. Idempotent: keeps other subscribers. |
| `issue_reminder` | write | `id`, `reminderAt` | 3 | - | Set a personal reminder on an issue. Fires as an inbox notification at `reminderAt` (type: issueReminder). Works on any issue regardless of state, but archived issues do NOT fire reminders. Calling again on the same issue overrides the prior reminder. |
| `delete_issue` | delete | `id` | 2 | - | Permanently delete an issue. |
| `archive_issue` | write | `id` | 2 | - | Archive an issue (soft delete, can be unarchived). |
| `unarchive_issue` | write | `id` | 2 | - | Unarchive a previously archived issue. |

Examples:

- `update_issue` (Move to project milestone): `{"workspace":"personal","id":"issue-uuid","projectId":"project-uuid","projectMilestoneId":"milestone-uuid"}`
- `update_issue` (Clear organization fields): `{"workspace":"personal","id":"issue-uuid","assigneeId":null,"projectId":null,"projectMilestoneId":null,"cycleId":null,"parentId":null,"dueDate":null,"estimate":null,"snoozedUntilAt":null}` - Use JSON null to clear nullable issue fields that Linear supports.
- `update_issue` (Add/remove labels by ID): `{"workspace":"personal","id":"issue-uuid","addedLabelIds":["label-uuid"],"removedLabelIds":["old-label-uuid"]}`

## Projects

Source files: `tools/projects.ts`

| Tool | Effect | Required params | Input fields | Feature gate | Description |
|---|---|---|---:|---|---|
| `search_projects` | read | - | 6 | - | Search and filter projects. This returns rich project readback; use first <= 25 and paginate to avoid Linear query-complexity limits, especially on the free test workspace. |
| `list_project_statuses` | read | - | 4 | - | List workspace-level project statuses. Use status IDs when creating or updating projects. |
| `get_project_status` | read | `id` | 2 | - | Get one project status by UUID. |
| `get_project` | read | `id` | 2 | - | Get a project by ID with content, direct comments, issues, members, and status updates. |
| `create_project` | write | `name`, `teamIds` | 19 | - | Create a new project. |
| `update_project` | write | `id` | 17 | - | Update an existing project. |
| `archive_project` | write | `id` | 2 | - | Archive a project. This uses Linear projectDelete, which is reversible via unarchive_project. |
| `unarchive_project` | write | `id` | 2 | - | Restore an archived project. |
| `create_project_status` | write | `name`, `color`, `position`, `type` | 8 | - | Create a workspace-level project status. Types: backlog, planned, started, paused, completed, canceled. |
| `update_project_status` | write | `id` | 8 | - | Update a workspace-level project status. |
| `archive_project_status` | write | `id` | 2 | - | Archive a project status. Reassign projects first if the status is in use. |
| `unarchive_project_status` | write | `id` | 2 | - | Unarchive a project status. |
| `reassign_project_status` | write | `originalProjectStatusId`, `newProjectStatusId` | 3 | - | Move all projects from one project status to another. Useful before archiving a status. |
| `create_project_update` | write | `projectId` | 4 | - | Post a status update on a project with health indicator. |
| `update_project_update` | write | `id` | 5 | - | Edit a project status update body and/or health. |
| `archive_project_update` | write | `id` | 2 | - | Archive a project status update. |
| `unarchive_project_update` | write | `id` | 2 | - | Restore an archived project status update. |
| `create_project_relation` | write | `type`, `projectId`, `anchorType`, `relatedProjectId`, `relatedAnchorType` | 9 | - | Create a project dependency relation. Type is currently "dependency"; anchorType values are start, end, or milestone. |
| `update_project_relation` | write | `id` | 9 | - | Update a project dependency relation. |
| `delete_project_relation` | delete | `id` | 2 | - | Delete a project relation. |
| `add_project_label` | write | `id`, `labelId` | 3 | - | Attach a project label to a project. |
| `remove_project_label` | write | `id`, `labelId` | 3 | - | Remove a project label from a project. |
| `create_project_milestone` | write | `projectId`, `name` | 5 | - | Create a milestone within a project. |
| `update_project_milestone` | write | `id` | 5 | - | Update a project milestone. |
| `delete_project_milestone` | delete | `id` | 2 | - | Delete a project milestone. |

Examples:

- `create_project` (Sandbox project): `{"workspace":"personal","name":"Linear MCP Sandbox","teamIds":["team-uuid"],"state":"planned","icon":"Briefcase","color":"#5e6ad2"}`
- `create_project_update` (Project status update): `{"workspace":"personal","projectId":"project-uuid","health":"onTrack","body":"Implementation is on track. Verification is passing."}`
- `create_project_relation` (Project dependency): `{"workspace":"personal","type":"dependency","projectId":"source-project-uuid","anchorType":"end","relatedProjectId":"blocked-project-uuid","relatedAnchorType":"start"}` - Linear currently accepts dependency relations; anchors are start, end, or milestone.

## Comments

Source files: `tools/comments.ts`

| Tool | Effect | Required params | Input fields | Feature gate | Description |
|---|---|---|---:|---|---|
| `get_comment` | read | `id` | 2 | - | Get one comment by UUID with parent, child replies, resolver metadata, target IDs, and source quote details. |
| `list_comments` | read | - | 17 | - | List comments with full thread readback. Filter by issueId, issueDescriptionId, documentId, documentContentId, projectId, initiativeId, projectUpdateId, parentId, projectContentId, initiativeContentId, query, or raw CommentFilter. |
| `check_comment_schema_drift` | read | - | 1 | - | Check the live Linear GraphQL schema for comment fields, filters, and create/update input fields used by the MCP. |
| `create_comment` | write | `body` | 16 | - | Add a comment to an issue, project, initiative, document content, project update, initiative update, or post. Provide exactly one target. Use parentId to reply; use quotedText with issueDescriptionId/documentId to create a real inline source anchor. |
| `update_comment` | write | `id`, `body` | 3 | - | Edit an existing comment. |
| `delete_comment` | delete | `id` | 2 | - | Delete a comment. |
| `resolve_comment` | write | `id` | 2 | - | Mark a comment as resolved. |
| `unresolve_comment` | write | `id` | 2 | - | Mark a comment as unresolved. |

Examples:

- `get_comment` (Inspect resolved inline comment): `{"workspace":"personal","id":"comment-uuid"}`
- `list_comments` (Issue comments): `{"workspace":"personal","issueId":"J-559","first":25}`
- `list_comments` (Inline issue-description comments): `{"workspace":"personal","issueDescriptionId":"J-559","first":25}`
- `list_comments` (Replies to a comment): `{"workspace":"personal","parentId":"comment-uuid","first":25}`
- `create_comment` (Issue comment): `{"workspace":"personal","issueId":"J-559","body":"Verified docs and runtime tool discovery."}`
- `create_comment` (Inline issue-description anchor): `{"workspace":"personal","issueDescriptionId":"J-559","quotedText":"ToolDef.description","body":"This wording should match runtime behavior."}` - Use issueDescriptionId plus exact quotedText when the comment should highlight source text in the Linear GUI.
- `create_comment` (Threaded reply): `{"workspace":"personal","issueId":"J-559","parentId":"comment-uuid","body":"Follow-up reply."}`

## Cycles

Source files: `tools/cycles.ts`

| Tool | Effect | Required params | Input fields | Feature gate | Description |
|---|---|---|---:|---|---|
| `list_cycles` | read | - | 6 | - | List cycles (sprints) for a team. Use "type" for quick access to current/next/previous cycle. |
| `create_cycle` | write | `teamId`, `startsAt`, `endsAt` | 6 | - | Create a new cycle (sprint) for a team. |
| `update_cycle` | write | `id` | 6 | - | Update an existing cycle. |
| `cycle_archive` | write | `id` | 2 | - | Archive a cycle. Linear has no hard-delete for cycles; archiving removes from active views while preserving history. Note: Linear rejects archiving the currently-active cycle. |

## Labels

Source files: `tools/labels.ts`

| Tool | Effect | Required params | Input fields | Feature gate | Description |
|---|---|---|---:|---|---|
| `list_labels` | read | - | 6 | - | List issue labels. Omit teamId to include workspace-level labels; pass teamId only when you intentionally need team-scoped labels. |
| `get_issue_label` | read | `id` | 2 | - | Get one issue label by UUID with parent/child and retired/archive metadata. |
| `create_issue_label` | write | `name` | 8 | - | Create an issue label. Set isGroup=true for a label group (parent), then use parentId on child labels. |
| `update_issue_label` | write | `id` | 9 | - | Update an issue label name, description, color, parent, group flag, or retiredAt timestamp. |
| `list_project_labels` | read | - | 5 | - | List project labels. Project labels are workspace-level; use filter for advanced ProjectLabelFilter queries. |
| `get_project_label` | read | `id` | 2 | - | Get one project label by UUID with parent/child and retired/archive metadata. |
| `create_project_label` | write | `name` | 6 | - | Create a project label. Set isGroup=true for a label group. |
| `update_project_label` | write | `id` | 8 | - | Update a project label name, description, color, parent, group flag, or retiredAt timestamp. |
| `issue_label_retire` | write | `id` | 2 | - | Retire an issue label so it stops appearing in pickers while preserving historical assignments. Reversible with issue_label_restore. |
| `issue_label_restore` | write | `id` | 2 | - | Restore a retired issue label. |
| `delete_issue_label` | delete | `id` | 2 | - | Permanently delete an issue label. Use only for disposable test labels; prefer issue_label_retire for normal workspace cleanup. |
| `project_label_retire` | write | `id` | 2 | - | Retire a project label so it stops appearing in pickers while preserving historical assignments. Reversible with project_label_restore. |
| `project_label_restore` | write | `id` | 2 | - | Restore a retired project label. |
| `delete_project_label` | delete | `id` | 2 | - | Permanently delete a project label. Use only for disposable test labels; prefer project_label_retire for normal workspace cleanup. |

Examples:

- `list_labels` (Workspace labels): `{"workspace":"personal","first":100}`
- `list_labels` (Team labels): `{"workspace":"personal","teamId":"team-uuid","first":100}`
- `create_issue_label` (Workspace label group): `{"workspace":"personal","name":"Linear MCP Sandbox","color":"#5e6ad2","isGroup":true}`
- `update_issue_label` (Rename/color): `{"workspace":"personal","id":"issue-label-uuid","name":"Updated label","color":"#26b5ce"}`
- `list_project_labels` (Workspace project labels): `{"workspace":"personal","first":100}`
- `create_project_label` (Project label group): `{"workspace":"personal","name":"Linear MCP Sandbox","color":"#5e6ad2","isGroup":true}`
- `update_project_label` (Rename/color): `{"workspace":"personal","id":"project-label-uuid","name":"Updated label","color":"#26b5ce"}`

## Initiatives

Source files: `tools/initiatives.ts`

| Tool | Effect | Required params | Input fields | Feature gate | Description |
|---|---|---|---:|---|---|
| `list_initiatives` | read | - | 3 | - | List all initiatives in the workspace. |
| `get_initiative` | read | `id` | 2 | - | Get a single initiative by ID with content, direct comments, linked projects, and updates. |
| `list_initiative_project_links` | read | - | 5 | - | List initiative-project link records. Optional client-side filters support initiativeId and projectId. |
| `create_initiative` | write | `name` | 12 | - | Create a new initiative. |
| `update_initiative` | write | `id` | 17 | - | Update an existing initiative. |
| `archive_initiative` | write | `id` | 2 | - | Archive an initiative. Reversible via unarchive_initiative. |
| `unarchive_initiative` | write | `id` | 2 | - | Restore an archived initiative. |
| `link_initiative_project` | write | `initiativeId`, `projectId` | 4 | - | Link a project to an initiative. |
| `update_initiative_project_link` | write | - | 5 | - | Update an initiative-project link record, currently used for sortOrder. |
| `unlink_initiative_project` | write | - | 4 | - | Unlink a project from an initiative. Accepts EITHER `linkId` (the InitiativeToProject record UUID) directly, OR `initiativeId` + `projectId` (looks up the link automatically). Use the latter when you don't have the link ID handy. |
| `create_initiative_update` | write | `initiativeId` | 4 | - | Post a status update on an initiative with health indicator. |
| `update_initiative_update` | write | `id` | 5 | - | Edit an initiative status update body and/or health. |
| `archive_initiative_update` | write | `id` | 2 | - | Archive an initiative status update. |
| `unarchive_initiative_update` | write | `id` | 2 | - | Restore an archived initiative status update. |

Examples:

- `create_initiative` (Smoke initiative): `{"workspace":"personal","name":"MCP Smoke Initiative","status":"Planned","icon":"MagicWand","color":"#5e6ad2"}`

## Notifications

Source files: `tools/notifications.ts`

| Tool | Effect | Required params | Input fields | Feature gate | Description |
|---|---|---|---:|---|---|
| `list_notifications` | read | - | 4 | - | List inbox notifications (issue updates, comments, reactions, assignments). Shows unread/unarchived by default and includes unreadCount. |
| `get_notification` | read | `id` | 2 | - | Get a single inbox notification by UUID with read/archive state and linked issue/project context. |
| `update_notification` | write | `id` | 6 | - | Low-level notification update. Set readAt to an ISO datetime to mark read, readAt to null to mark unread, or snoozedUntilAt to snooze/unsnooze where Linear supports it. |
| `mark_notification_read` | write | `id` | 3 | - | Mark one notification as read. Defaults readAt to the current time. |
| `mark_notification_unread` | write | `id` | 2 | - | Mark one notification as unread by clearing readAt. |
| `archive_notification` | write | `id` | 2 | - | Archive one inbox notification. Reversible with unarchive_notification. |
| `unarchive_notification` | write | `id` | 2 | - | Restore one archived inbox notification. |

Examples:

- `list_notifications` (Unread inbox): `{"workspace":"personal","includeArchived":false,"first":25}`
- `list_notifications` (Archived/read notifications): `{"workspace":"personal","includeArchived":true,"first":25}`
- `get_notification` (Inspect notification): `{"workspace":"personal","id":"notification-uuid"}`
- `update_notification` (Mark read at explicit time): `{"workspace":"personal","id":"notification-uuid","readAt":"2026-05-27T12:00:00.000Z"}`
- `update_notification` (Mark unread): `{"workspace":"personal","id":"notification-uuid","readAt":null}`

## Issue Relations

Source files: `tools/relations.ts`

| Tool | Effect | Required params | Input fields | Feature gate | Description |
|---|---|---|---:|---|---|
| `create_issue_relation` | write | `type`, `issueId`, `relatedIssueId` | 4 | - | Create a relation between two issues (blocks, duplicate, related, similar). |
| `mark_issue_duplicate` | write | `issueId`, `duplicateOfIssueId` | 4 | - | Mark one issue as a duplicate of another. Ensures a duplicate relation exists from issueId to duplicateOfIssueId, then moves issueId to the team Duplicate workflow state. |
| `delete_issue_relation` | delete | `id` | 2 | - | Delete a relation between two issues. |

Examples:

- `mark_issue_duplicate` (Mark duplicate): `{"workspace":"personal","issueId":"duplicate-issue-uuid","duplicateOfIssueId":"canonical-issue-uuid"}`

## Reactions

Source files: `tools/reactions.ts`

| Tool | Effect | Required params | Input fields | Feature gate | Description |
|---|---|---|---:|---|---|
| `create_reaction` | write | `emoji` | 6 | - | Add an emoji reaction to a comment, issue, project update, or initiative update. Provide exactly one target ID. |
| `delete_reaction` | delete | `id` | 2 | - | Remove an emoji reaction. |

## Documents

Source files: `tools/documents.ts`

| Tool | Effect | Required params | Input fields | Feature gate | Description |
|---|---|---|---:|---|---|
| `create_document` | write | `title` | 8 | - | Create a document. Link to a project, initiative, or team. |
| `update_document` | write | `id` | 6 | - | Update a document title, content, icon, or color. |
| `get_document` | read | `id` | 2 | - | Get a document by UUID, including full markdown content. |
| `search_documents` | read | - | 6 | - | Search and list documents. Optionally filter by project or initiative. |
| `delete_document` | delete | `id` | 2 | - | Delete a document. |

## Favorites

Source files: `tools/favorites.ts`

| Tool | Effect | Required params | Input fields | Feature gate | Description |
|---|---|---|---:|---|---|
| `list_favorites` | read | - | 4 | - | List sidebar favorites and favorite folders. Favorites are personal to the authenticated Linear user. This is a rich readback query; keep first <= 50 and paginate to avoid Linear query-complexity limits. |
| `create_favorite` | write | - | 19 | - | Create a sidebar favorite or folder. Use folderName for a folder; otherwise provide exactly one target ID such as customViewId, projectId, issueId, labelId, or initiativeId. Use parentId to place it inside a folder. sortOrder is best-effort: Linear may normalize ordering on readback. |
| `update_favorite` | write | `id` | 5 | - | Update a favorite folder name, parent folder, or sortOrder. Linear only exposes folderName, parentId, and sortOrder for favorite updates; sortOrder updates can be accepted but normalized on readback. |
| `delete_favorite` | delete | `id` | 2 | - | Remove a sidebar favorite or favorite folder. This only removes the shortcut/folder, not the underlying issue, project, view, or label. |

Examples:

- `list_favorites` (First page): `{"workspace":"personal","first":50}`
- `create_favorite` (Folder): `{"workspace":"personal","folderName":"Linear MCP Sandbox","sortOrder":1000}`
- `create_favorite` (Custom view in folder): `{"workspace":"personal","customViewId":"custom-view-uuid","parentId":"favorite-folder-uuid","sortOrder":1001}`
- `update_favorite` (Reorder): `{"workspace":"personal","id":"favorite-uuid","sortOrder":2000}`

## Views

Source files: `tools/views.ts`

| Tool | Effect | Required params | Input fields | Feature gate | Description |
|---|---|---|---:|---|---|
| `list_views` | read | - | 5 | - | List saved custom views (filters). By default this returns workspace/team-level views from Linear customViews, which explicitly excludes project/initiative tab views. Pass projectId or initiativeId to list UI tab views attached via facets. Use first <= 50 per page and paginate with after for the default customViews listing. |
| `get_view` | read | `id` | 2 | - | Get a custom view by ID with its filter configuration, effective preferences, model type, and facet readback when it is attached as a project/initiative/team/workspace tab. |
| `check_view_schema_drift` | read | - | 1 | - | Check the live Linear GraphQL schema for the custom-view input/filter fields used by MCP schemas, examples, and smoke fixtures. Fails if a required field disappears. |
| `create_view` | write | `name` | 15 | - | Create a saved custom view (filter). Returns full custom-view readback including owner/team/facet, model type, filters, preferences, and timestamps. Omit teamId for workspace-level issue views; pass teamId only when you intentionally need a team-scoped issue view. Linear public GraphQL currently accepts projectId/initiativeId but does not create the UI project/initiative tab facet; use list_views with projectId/initiativeId or get_view.facet to read UI-created scoped tabs. Do not put team in filterData because Linear renders that as a non-editable raw filter; this tool strips team filters from filterData. Use filterData for editable issue filters and projectFilterData for project views. For GUI-friendly project views, this tool strips project status filters from projectFilterData; use projectGrouping/display preferences instead. The tool normalizes common unsafe shapes like state.type.eq. Icons accept Linear icon names such as "Health", "Rocket", or "Briefcase"; colors use hex. |
| `update_view` | write | `id` | 15 | - | Update a custom view, including filters and visual metadata. Returns full custom-view readback including owner/team/facet, model type, filters, preferences, and timestamps. Linear public GraphQL currently accepts projectId/initiativeId but does not create or move the UI project/initiative tab facet; check get_view.facet for real scoped-tab attachment. Icons accept Linear icon names; colors use hex. |
| `delete_view` | delete | `id` | 2 | - | Delete a custom view. |
| `set_view_preferences` | write | `customViewId`, `preferences` | 4 | - | Set layout, grouping, ordering, and display fields for a custom view. The tool normalizes common aliases (for example status -> workflowState, noGrouping -> none, createdAt -> dateCreated) so the Linear UI does not show blank dropdown states. |

Examples:

- `create_view` (Workspace active issues): `{"workspace":"personal","name":"Active issues","icon":"Health","color":"#5e6ad2","shared":false,"filterData":{"state":{"type":{"in":["triage","backlog","unstarted","started"]}}}}` - Workspace-level issue view. GUI-safe state type filter; no team filter in filterData.
- `create_view` (Team-scoped issues): `{"workspace":"personal","name":"Team active issues","icon":"Health","color":"#5e6ad2","teamId":"team-uuid","filterData":{"state":{"type":{"in":["unstarted","started"]}}}}` - Use top-level teamId only when the view should intentionally live under one team.
- `create_view` (No project filter): `{"workspace":"personal","name":"Inbox without project","icon":"Health","color":"#26b5ce","filterData":{"project":{"or":[{"id":{"in":[]}},{"null":true}]}}}` - GUI-safe replacement for project.null=true.
- `create_view` (Label filter): `{"workspace":"personal","name":"Label queue","icon":"Health","color":"#4cb782","filterData":{"labels":{"id":{"in":["label-uuid"]}}}}` - Filter issues by labels while staying editable in the Linear filter GUI.
- `create_view` (Project display view): `{"workspace":"test","name":"Projects by Status","icon":"Briefcase","color":"#f2c94c","shared":false,"projectFilterData":{}}` - For project views, prefer empty projectFilterData plus project display preferences.
- `create_view` (Initiatives by team): `{"workspace":"personal","name":"Team initiatives","icon":"Health","color":"#26b5ce","initiativeFilterData":{"teams":{"id":{"in":["team-uuid"]}}}}` - Initiative view filter using the workspace team collection relation.
- `create_view` (Known-bad team filter): `{"workspace":"personal","name":"Bad team filter example","filterData":{"team":{"id":{"eq":"team-uuid"}}}}` - This executes but renders as a non-editable raw Team filter in Linear; the MCP strips team from filterData.
- `create_view` (Known-bad project status filter): `{"workspace":"test","name":"Bad project status filter example","projectFilterData":{"status":{"id":{"in":["project-status-uuid"]}}}}` - This can render as a one-status/type project filter that is hard to edit; the MCP strips projectFilterData.status.
- `set_view_preferences` (Personal list defaults): `{"workspace":"personal","customViewId":"custom-view-uuid","type":"user","preferences":{"layout":"list","issueGrouping":"none","viewOrdering":"priority","viewOrderingDirection":"asc","showCompletedIssues":"none","fieldAssignee":false,"fieldStatus":true,"fieldPriority":true,"fieldProject":true,"fieldDueDate":true,"fieldLabels":true,"fieldMilestone":true}}` - List layout, no grouping, hide assignee, show status/priority/project/due date.
- `set_view_preferences` (Grouped by status): `{"workspace":"personal","customViewId":"custom-view-uuid","type":"user","preferences":{"layout":"list","issueGrouping":"workflowState","issueSubGrouping":"none","showEmptyGroups":false,"fieldAssignee":false,"fieldStatus":true,"fieldPriority":true}}` - GUI-safe internal grouping value for the Linear Status dropdown.
- `set_view_preferences` (Board by assignee): `{"workspace":"personal","customViewId":"custom-view-uuid","type":"user","preferences":{"layout":"board","issueGrouping":"assignee","issueSubGrouping":"none","viewOrdering":"priority","viewOrderingDirection":"asc","showCompletedIssues":"none","fieldStatus":true,"fieldPriority":true,"fieldLabels":true,"fieldProject":true}}` - Board layout with assignee grouping and stable visible issue fields.
- `set_view_preferences` (Project list): `{"workspace":"test","customViewId":"custom-view-uuid","type":"user","preferences":{"projectLayout":"list","projectGrouping":"status","projectViewOrdering":"priority","showCompletedProjects":"none","projectFieldStatus":true,"projectFieldHealth":true,"projectFieldLead":true,"projectFieldStartDate":true,"projectFieldTargetDate":true}}`
- `set_view_preferences` (Project board by lead): `{"workspace":"test","customViewId":"custom-view-uuid","type":"user","preferences":{"projectLayout":"board","projectGrouping":"lead","projectViewOrdering":"priority","showCompletedProjects":"none","projectFieldStatus":true,"projectFieldPriority":true,"projectFieldLead":true,"projectFieldHealth":true,"projectFieldTeams":true,"projectFieldInitiatives":true}}` - Project display preferences without raw project status filters.

## Files

Source files: `tools/files.ts`

| Tool | Effect | Required params | Input fields | Feature gate | Description |
|---|---|---|---:|---|---|
| `upload_file` | upload | `path` | 7 | - | Upload one local file to Linear private storage using fileUpload + signed PUT. Returns assetUrl and markdown. This is distinct from URL/resource attachments. |
| `upload_image_from_url` | upload | `url` | 3 | - | Ask Linear to upload an image from a public URL into Linear storage. Returns assetUrl and markdown. |
| `create_comment_with_files` | upload | `paths` | 20 | - | Upload local files and create a Linear comment containing their markdown links/assets. Provide exactly one comment target. Use issueDescriptionId/documentId with quotedText to create a real inline source anchor. |
| `append_issue_files` | upload | `issueId`, `paths` | 7 | - | Upload local files and append their markdown links/assets to an issue description. |
| `append_project_files` | upload | `projectId`, `paths` | 7 | - | Upload local files and append their markdown links/assets to a project rich content field. |
| `append_initiative_files` | upload | `initiativeId`, `paths` | 7 | - | Upload local files and append their markdown links/assets to an initiative rich content field. |
| `create_project_update_with_files` | upload | `projectId`, `paths` | 8 | - | Upload local files and create a project status update containing their markdown links/assets. |
| `create_initiative_update_with_files` | upload | `initiativeId`, `paths` | 8 | - | Upload local files and create an initiative status update containing their markdown links/assets. |
| `create_document_with_files` | upload | `title`, `paths` | 12 | - | Upload local files and create a Linear document containing their markdown links/assets. |
| `update_document_with_files` | upload | `id`, `paths` | 7 | - | Upload local files and append their markdown links/assets to an existing Linear document. |

Examples:

- `upload_file` (Upload local PDF): `{"workspace":"personal","path":"/absolute/path/report.pdf","makePublic":false}` - Use file upload tools for local binary files; the result includes markdown to paste into descriptions/comments/documents.
- `upload_file` (Upload image with markdown): `{"workspace":"personal","path":"/absolute/path/screenshot.png","embedImages":true}`
- `create_comment_with_files` (Issue comment with files): `{"workspace":"personal","issueId":"J-559","body":"Attached verification output.","paths":["/absolute/path/report.md","/absolute/path/screenshot.png"]}`
- `create_comment_with_files` (Inline comment with files): `{"workspace":"personal","issueDescriptionId":"J-559","quotedText":"CAPABILITIES.md","body":"Rendered output attached.","paths":["/absolute/path/capabilities-diff.txt"]}` - Use issueDescriptionId/documentId plus quotedText for GUI-highlighted anchors.

## Attachments

Source files: `tools/attachments.ts`

| Tool | Effect | Required params | Input fields | Feature gate | Description |
|---|---|---|---:|---|---|
| `create_attachment` | write | `issueId`, `title`, `url` | 8 | - | Attach a URL/resource to an issue. Supports optional metadata (JSON), iconUrl, and commentBody (auto-creates a comment on the issue). |
| `update_attachment` | write | `id` | 6 | - | Update an attachment's title, subtitle, url, or metadata. |
| `delete_attachment` | delete | `id` | 2 | - | Delete an attachment from an issue. |
| `link_attachment_url` | write | `issueId`, `url` | 4 | - | Simplified URL attachment. Links a URL to an issue with auto-detected metadata. |
| `link_attachment_discord` | write | `issueId`, `channelId`, `messageId`, `url` | 6 | Requires the Discord OAuth integration in the Linear workspace. | Link a Discord message to an issue using Linear's Discord integration. Requires Discord OAuth integration in the Linear workspace. For Discord thread messages, pass the thread ID as channelId, the in-thread message ID as messageId, and the full /channels/<guild>/<thread>/<message> URL; Linear opens back into the correct thread on click. Use create_attachment with a Discord URL as fallback if integration is not set up. |

Examples:

- `create_attachment` (External resource card): `{"workspace":"personal","issueId":"J-559","title":"Linear API docs","url":"https://developers.linear.app/docs/graphql/working-with-the-graphql-api"}` - Use attachments for URLs/resources, not local file uploads.
- `create_attachment` (Resource card with comment): `{"workspace":"personal","issueId":"J-559","title":"Design note","url":"https://example.com/design-note","commentBody":"Linked for context."}`
- `link_attachment_discord` (Discord message in biz): `{"workspace":"biz","issueId":"SPE-123","channelId":"discord-channel-id","messageId":"discord-message-id","url":"https://discord.com/channels/guild/channel/message"}` - The Discord integration is enabled in biz; use create_attachment with the URL as fallback when the integration rejects the link.
- `link_attachment_discord` (Discord thread message in biz): `{"workspace":"biz","issueId":"SPE-123","channelId":"discord-thread-id","messageId":"thread-message-id","url":"https://discord.com/channels/guild/thread/message","title":"Discord thread"}` - Use the Discord thread ID as channelId. Verified with SPE-2217: clicking the Linear attachment opened the linked Discord thread.

## Batch Operations

Source files: `tools/batch.ts`

| Tool | Effect | Required params | Input fields | Feature gate | Description |
|---|---|---|---:|---|---|
| `issue_batch_create` | write | `issues` | 2 | - | Create multiple issues in a single API call. Each issue uses the same IssueCreateInput format as create_issue. Supports cross-team creation. |
| `issue_batch_update` | write | `ids` | 12 | - | Apply the same update to multiple issues at once. Pass an array of issue UUIDs and the fields to update (same as update_issue). Supports null to clear some fields; if any issue ID is invalid, Linear rejects the batch operation. |

Examples:

- `issue_batch_update` (Bulk move): `{"workspace":"personal","ids":["issue-uuid-1","issue-uuid-2"],"projectId":"project-uuid","projectMilestoneId":"milestone-uuid"}`

## Templates

Source files: `tools/templates.ts`

| Tool | Effect | Required params | Input fields | Feature gate | Description |
|---|---|---|---:|---|---|
| `list_templates` | read | - | 2 | - | List workspace templates, or team templates when teamId is provided. Templates have types: issue, project, recurringIssue, document, releaseNote. The templateData JSON field carries entity-specific config; for recurringIssue type it includes `schedule: {interval, type, startAt}` where type is "days" \| "weeks" \| "months" \| "years". |
| `get_template` | read | `id` | 2 | - | Get a single template by UUID. Returns templateData as a JSON-encoded string — parse client-side. |
| `create_template` | write | `name`, `type`, `templateData` | 10 | - | Create a template. For recurringIssue type, templateData MUST include a schedule object — Linear rejects with "The recurring issue template must have a schedule." Schedule shape: {interval: 1, type: "days"\|"weeks"\|"months"\|"years", startAt: "YYYY-MM-DD"}. templateData accepts either a JSON-encoded string or a plain object (auto-stringified). |
| `create_recurring_issue_template` | write | `name`, `teamId`, `title`, `scheduleInterval`, `scheduleType`, `startAt` | 20 | - | Create a recurring issue template with validated schedule fields instead of fragile raw templateData JSON. Delete the template to stop future spawning; archive any already-created recurring issues separately. |
| `update_template` | write | `id` | 9 | - | Update an existing template. Pass changed fields only. templateData replaces entirely (no merge). |
| `update_recurring_issue_template` | write | `id` | 20 | - | Update a recurring issue template with validated schedule fields. Reads the existing templateData, merges provided issue/schedule fields, and replaces templateData with a full valid recurringIssue payload. |
| `delete_template` | delete | `id` | 2 | - | Hard-delete a template. Irreversible — use only for test/cleanup. To stop a recurring template from spawning future issues, delete it; archive any already-created issues separately. |

Examples:

- `create_recurring_issue_template` (Weekly recurring issue): `{"workspace":"test","name":"MCP Smoke Weekly Template","teamId":"team-uuid","title":"Weekly review","issueDescription":"Recurring issue generated by Linear.","scheduleInterval":1,"scheduleType":"weeks","startAt":"2026-12-31","icon":"Health","color":"#5e6ad2"}` - Use a far-future startAt for fixtures, but still verify whether Linear created an initial issue and archive it separately.

## Runtime Notes

- `workspace` selects `biz`, `personal`, `test`, or `jonas-test-workspace` where the tool schema exposes it; `biz` is the default.
- Workspace plan levels: `biz` and `personal` are Basic; `jonas-test-workspace` is Free.
- Prefer archive/unarchive tools over hard-delete tools except for disposable test records.
- Binary/local file uploads use the file tools. URL/resource cards use attachment tools.
- Workspace-level views omit `teamId` and use shared organization preferences.
- Project statuses, labels, templates, and views are workspace-level unless a tool call explicitly scopes them.
