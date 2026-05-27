# Linear MCP Server - Generated Capabilities

<!-- GENERATED FILE: run `bun run docs:capabilities` from this server directory. Do not hand-edit. -->

**Server source**: `/Users/jonas/.agents/mcp/servers/linear`
**Tool count**: 106
**Workspace-aware tools**: 106/106
**Paginated tools**: 9

## Source Of Truth

- Runtime tool names, descriptions, schemas, domains, side effects, and feature gates live in `tools/*.ts` and `tools/registry.ts`.
- This file is generated from the live registry metadata.
- Agent operating policy lives in `/Users/jonas/.agents/skills/linear/SKILL.md`.
- Workspace state such as team IDs, workflow states, labels, project statuses, templates, and custom views must be queried live via the MCP.

## Discovery Model

1. Use MCP tool discovery first; the server publishes each tool name, description, and JSON input schema at runtime.
2. Use this file for a compact human-readable index and drift checks.
3. Use live Linear reads for workspace-specific IDs and configuration.
4. Keep detailed behavior near the code path that implements it, then regenerate this file.

Useful live-discovery tools: `get_viewer`, `get_teams`, `list_labels`, `list_project_statuses`, `list_templates`, `list_views`, `search_projects`, `list_initiatives`.

## Domain Index

| Domain | Tools | Read | Write | Upload | Delete | Feature-gated |
|---|---:|---:|---:|---:|---:|---:|
| Users | 1 | 1 | 0 | 0 | 0 | 0 |
| Teams | 2 | 1 | 1 | 0 | 0 | 0 |
| Issues | 8 | 2 | 5 | 0 | 1 | 0 |
| Projects | 25 | 4 | 19 | 0 | 2 | 0 |
| Comments | 5 | 0 | 4 | 0 | 1 | 0 |
| Cycles | 4 | 1 | 3 | 0 | 0 | 0 |
| Labels | 4 | 1 | 3 | 0 | 0 | 0 |
| Initiatives | 19 | 3 | 15 | 0 | 1 | 5 |
| Notifications | 1 | 1 | 0 | 0 | 0 | 0 |
| Issue Relations | 2 | 0 | 1 | 0 | 1 | 0 |
| Reactions | 2 | 0 | 1 | 0 | 1 | 0 |
| Documents | 5 | 2 | 2 | 0 | 1 | 0 |
| Views | 6 | 2 | 3 | 0 | 1 | 0 |
| Files | 10 | 0 | 0 | 10 | 0 | 0 |
| Attachments | 5 | 0 | 4 | 0 | 1 | 1 |
| Batch Operations | 2 | 0 | 2 | 0 | 0 | 0 |
| Templates | 5 | 2 | 2 | 0 | 1 | 0 |

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
| `create_issue` | write | `teamId`, `title` | 13 | - | Create a new issue. Requires teamId and title at minimum. |
| `update_issue` | write | `id` | 19 | - | Update an existing issue. Pass the issue ID and any fields to change. |
| `issue_reminder` | write | `id`, `reminderAt` | 3 | - | Set a personal reminder on an issue. Fires as an inbox notification at `reminderAt` (type: issueReminder). Works on any issue regardless of state, but archived issues do NOT fire reminders. Calling again on the same issue overrides the prior reminder. |
| `delete_issue` | delete | `id` | 2 | - | Permanently delete an issue. |
| `archive_issue` | write | `id` | 2 | - | Archive an issue (soft delete, can be unarchived). |
| `unarchive_issue` | write | `id` | 2 | - | Unarchive a previously archived issue. |

## Projects

Source files: `tools/projects.ts`

| Tool | Effect | Required params | Input fields | Feature gate | Description |
|---|---|---|---:|---|---|
| `search_projects` | read | - | 6 | - | Search and filter projects. |
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

## Comments

Source files: `tools/comments.ts`

| Tool | Effect | Required params | Input fields | Feature gate | Description |
|---|---|---|---:|---|---|
| `create_comment` | write | `body` | 16 | - | Add a comment to an issue, project, initiative, document content, project update, initiative update, or post. Provide exactly one target. Use parentId to reply; use quotedText with issueDescriptionId/documentId to create a real inline source anchor. |
| `update_comment` | write | `id`, `body` | 3 | - | Edit an existing comment. |
| `delete_comment` | delete | `id` | 2 | - | Delete a comment. |
| `resolve_comment` | write | `id` | 2 | - | Mark a comment as resolved. |
| `unresolve_comment` | write | `id` | 2 | - | Mark a comment as unresolved. |

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
| `list_labels` | read | - | 5 | - | List issue labels. Optionally filter by team. |
| `create_issue_label` | write | `name` | 7 | - | Create an issue label. Set isGroup=true for a label group (parent), then use parentId on child labels. |
| `create_project_label` | write | `name` | 6 | - | Create a project label. Set isGroup=true for a label group. |
| `issue_label_retire` | write | `id` | 2 | - | Retire (soft-delete / archive) an issue label. Linear has no hard-delete for labels; this archives the label so it stops appearing in pickers while preserving historical assignments. |

## Initiatives

Source files: `tools/initiatives.ts`

| Tool | Effect | Required params | Input fields | Feature gate | Description |
|---|---|---|---:|---|---|
| `list_initiatives` | read | - | 3 | - | List all initiatives in the workspace. |
| `get_initiative` | read | `id` | 2 | - | Get a single initiative by ID with content, direct comments, linked projects, and updates. |
| `list_initiative_project_links` | read | - | 5 | - | List initiative-project link records. Optional client-side filters support initiativeId and projectId. |
| `create_initiative` | write | `name` | 13 | - | Create a new initiative. |
| `update_initiative` | write | `id` | 18 | - | Update an existing initiative. |
| `archive_initiative` | write | `id` | 2 | - | Archive an initiative. Reversible via unarchive_initiative. |
| `unarchive_initiative` | write | `id` | 2 | - | Restore an archived initiative. |
| `link_initiative_project` | write | `initiativeId`, `projectId` | 4 | - | Link a project to an initiative. |
| `update_initiative_project_link` | write | - | 5 | - | Update an initiative-project link record, currently used for sortOrder. |
| `unlink_initiative_project` | write | - | 4 | - | Unlink a project from an initiative. Accepts EITHER `linkId` (the InitiativeToProject record UUID) directly, OR `initiativeId` + `projectId` (looks up the link automatically). Use the latter when you don't have the link ID handy. |
| `create_initiative_update` | write | `initiativeId` | 4 | - | Post a status update on an initiative with health indicator. |
| `update_initiative_update` | write | `id` | 5 | - | Edit an initiative status update body and/or health. |
| `archive_initiative_update` | write | `id` | 2 | - | Archive an initiative status update. |
| `unarchive_initiative_update` | write | `id` | 2 | - | Restore an archived initiative status update. |
| `create_initiative_relation` | write | `initiativeId`, `relatedInitiativeId` | 5 | Requires Linear Enterprise sub-initiative relations. | Create an initiative relation/sub-initiative link. This may be Enterprise-gated in Linear. |
| `update_initiative_relation` | write | `id` | 3 | Requires Linear Enterprise sub-initiative relations. | Update an initiative relation sort order. This may be Enterprise-gated in Linear. |
| `delete_initiative_relation` | delete | `id` | 2 | Requires Linear Enterprise sub-initiative relations. | Delete an initiative relation. This may be Enterprise-gated in Linear. |
| `add_initiative_label` | write | `id`, `labelId` | 3 | Requires initiative labels to be enabled for the workspace. | Attach an initiative label to an initiative. This may be feature-gated in Linear. |
| `remove_initiative_label` | write | `id`, `labelId` | 3 | Requires initiative labels to be enabled for the workspace. | Remove an initiative label from an initiative. This may be feature-gated in Linear. |

## Notifications

Source files: `tools/notifications.ts`

| Tool | Effect | Required params | Input fields | Feature gate | Description |
|---|---|---|---:|---|---|
| `list_notifications` | read | - | 4 | - | List inbox notifications (issue updates, comments, reactions, assignments). Shows unread by default. |

## Issue Relations

Source files: `tools/relations.ts`

| Tool | Effect | Required params | Input fields | Feature gate | Description |
|---|---|---|---:|---|---|
| `create_issue_relation` | write | `type`, `issueId`, `relatedIssueId` | 4 | - | Create a relation between two issues (blocks, duplicate, related, similar). |
| `delete_issue_relation` | delete | `id` | 2 | - | Delete a relation between two issues. |

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

## Views

Source files: `tools/views.ts`

| Tool | Effect | Required params | Input fields | Feature gate | Description |
|---|---|---|---:|---|---|
| `list_views` | read | - | 3 | - | List saved custom views (filters). |
| `get_view` | read | `id` | 2 | - | Get a custom view by ID with its filter configuration. |
| `create_view` | write | `name` | 15 | - | Create a saved custom view (filter). Use filterData for issue views, projectFilterData for project views. |
| `update_view` | write | `id` | 15 | - | Update a custom view. |
| `delete_view` | delete | `id` | 2 | - | Delete a custom view. |
| `set_view_preferences` | write | `customViewId`, `preferences` | 4 | - | Set layout, grouping, ordering, and display fields for a custom view. Issue views use layout/issueGrouping/viewOrdering. Project views use projectLayout/projectGrouping/projectViewOrdering. |

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

## Attachments

Source files: `tools/attachments.ts`

| Tool | Effect | Required params | Input fields | Feature gate | Description |
|---|---|---|---:|---|---|
| `create_attachment` | write | `issueId`, `title`, `url` | 8 | - | Attach a URL/resource to an issue. Supports optional metadata (JSON), iconUrl, and commentBody (auto-creates a comment on the issue). |
| `update_attachment` | write | `id` | 6 | - | Update an attachment's title, subtitle, url, or metadata. |
| `delete_attachment` | delete | `id` | 2 | - | Delete an attachment from an issue. |
| `link_attachment_url` | write | `issueId`, `url` | 4 | - | Simplified URL attachment. Links a URL to an issue with auto-detected metadata. |
| `link_attachment_discord` | write | `issueId`, `channelId`, `messageId`, `url` | 6 | Requires the Discord OAuth integration in the Linear workspace. | Link a Discord message to an issue. Requires Discord OAuth integration in the Linear workspace. Use create_attachment with a Discord URL as fallback if integration is not set up. |

## Batch Operations

Source files: `tools/batch.ts`

| Tool | Effect | Required params | Input fields | Feature gate | Description |
|---|---|---|---:|---|---|
| `issue_batch_create` | write | `issues` | 2 | - | Create multiple issues in a single API call. Each issue uses the same IssueCreateInput format as create_issue. Supports cross-team creation. |
| `issue_batch_update` | write | `ids` | 11 | - | Apply the same update to multiple issues at once. Pass an array of issue UUIDs and the fields to update (same as update_issue). Supports null to clear fields. |

## Templates

Source files: `tools/templates.ts`

| Tool | Effect | Required params | Input fields | Feature gate | Description |
|---|---|---|---:|---|---|
| `list_templates` | read | - | 2 | - | List workspace templates, or team templates when teamId is provided. Templates have types: issue, project, recurringIssue, document, releaseNote. The templateData JSON field carries entity-specific config; for recurringIssue type it includes `schedule: {interval, type, startAt}` where type is "days" \| "weeks" \| "months" \| "years". |
| `get_template` | read | `id` | 2 | - | Get a single template by UUID. Returns templateData as a JSON-encoded string — parse client-side. |
| `create_template` | write | `name`, `type`, `templateData` | 10 | - | Create a template. For recurringIssue type, templateData MUST include a schedule object — Linear rejects with "The recurring issue template must have a schedule." Schedule shape: {interval: 1, type: "days"\|"weeks"\|"months"\|"years", startAt: "YYYY-MM-DD"}. templateData accepts either a JSON-encoded string or a plain object (auto-stringified). |
| `update_template` | write | `id` | 9 | - | Update an existing template. Pass changed fields only. templateData replaces entirely (no merge). |
| `delete_template` | delete | `id` | 2 | - | Hard-delete a template. Irreversible — use only for test/cleanup. To stop a recurring template from spawning, delete it (or update its schedule to a far-future date). |

## Runtime Notes

- `workspace` selects `biz` or `personal` where the tool schema exposes it; `biz` is the default.
- Prefer archive/unarchive tools over hard-delete tools except for disposable test records.
- Binary/local file uploads use the file tools. URL/resource cards use attachment tools.
- Workspace-level views omit `teamId` and use shared organization preferences.
- Project statuses, labels, templates, and views are workspace-level unless a tool call explicitly scopes them.
