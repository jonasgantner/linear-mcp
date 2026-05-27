# Linear MCP Server — Capabilities Reference

**Server**: `~/.agents/mcp/servers/linear/` (Bun/TypeScript, raw GraphQL)
**Tools**: 106 (2026-05-27: project status CRUD, project archive lifecycle, multi-initiative links, initiative lifecycle, relations, labels, update lifecycle, richer views/templates)
**Workspaces**: `biz` (default), `personal` — every tool accepts `workspace` param
**Auth**: PAT via `Authorization` header (no `@linear/sdk`, no Bearer prefix)
**Throttle**: 250ms per workspace

---

## Tools by Domain

### Issues (7 tools)

| Tool | Description | Key params |
|---|---|---|
| `search_issues` | Search/filter issues | `state`, `assignee` ("me"), `label`, `team`, `project`, `priority` (0-4), `query`, `filter` (raw IssueFilter) |
| `get_issue` | Full issue details | `id` (UUID or identifier like "SPE-123") |
| `create_issue` | Create issue | `teamId`*, `title`*, `description`, `priority`, `stateId`, `assigneeId`, `labelIds`, `cycleId`, `projectId`, `dueDate`, `estimate`, `parentId` |
| `update_issue` | Update issue fields | `id`*, plus any field. Supports `addedLabelIds`, `removedLabelIds`, `projectMilestoneId`, `teamId` (move between teams), `snoozedUntilAt`, `snoozedById` |
| `issue_reminder` | Set personal reminder (added 2026-05-16) | `id`*, `reminderAt`* (ISO 8601 DateTime). Fires as inbox notification at the time. |
| `delete_issue` | Permanently delete | `id`* |
| `archive_issue` | Soft archive | `id`* |
| `unarchive_issue` | Restore archived | `id`* |

**Tested findings:**
- Issues do NOT have `startDate` (only `dueDate`). Projects have `startDate`.
- `addedLabelIds` and `removedLabelIds` work for incremental label changes.
- Identifiers like `SPE-123` work in `id` param for get/update/delete.
- Sub-issues via `parentId` on create. Visible in parent's `children.nodes`.
- `snoozedUntilAt` is settable on any issue regardless of state (tested on Todo). GUI only exposes the snooze affordance in Triage/Inbox. `get_issue` + `update_issue` now return `snoozedUntilAt` + `snoozedBy` in their payloads.
- `issue_reminder` fires as `IssueNotification` with `type: issueReminder` in the user's inbox. Calling again on the same issue overrides the prior reminder (no separate cancel mutation). **Archiving an issue with a pending reminder suppresses it** (tested with J-400).

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
| `create_comment` | Comment on issues, updates, projects, initiatives, documents/content, or posts | `body`*, plus exactly one target: `issueId`, `projectUpdateId`, `initiativeUpdateId`, `projectId`, `initiativeId`, `documentContentId`, `documentId`, `issueDescriptionId`, `projectContentId`, `initiativeContentId`, or `postId`. `parentId` for threaded replies; `quotedText` for real inline anchors when using parent content targets. |
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
- Direct project comments use `projectId`; direct initiative comments use `initiativeId`.
- Rich-text/content comments use `documentContentId` under the hood. For GUI yellow highlights/direct source links, use `issueDescriptionId` or `documentId` so the tool can also patch the owning rich-text state.
- `quotedText` must match a current text span exactly. The tool creates the comment with a known UUID and writes an `inlineComment` mark into `descriptionData`/`contentData`; otherwise Linear renders the quote as a stale/struck-through detached quote.
- For issue description quoted comments, pass `issueDescriptionId` plus `quotedText`; using `issueId` creates a normal issue activity comment and does not attach to selected description text.
- Project/initiative rich content comments can target `projectContentId`/`initiativeContentId`, but do not pass `quotedText`: Linear rejects `contentData` on project/initiative update inputs, so API-created source highlights are not currently supported for those surfaces.
- `get_issue` returns both normal issue comments and `documentContentComments` for issue-description content comments. `get_document` returns document comments.

### Reactions (2 tools)

| Tool | Description | Key params |
|---|---|---|
| `create_reaction` | Add emoji reaction | `emoji`* (e.g. "+1", "heart", "rocket"), plus one target: `commentId`, `issueId`, `projectUpdateId`, or `initiativeUpdateId` |
| `delete_reaction` | Remove reaction | `id`* |

**Tested findings:**
- Emoji format is plain names: `+1`, `heart`, `rocket`, `tada`. Not Unicode, not `:colon:` format.
- Can react to comments, issues, project updates, and initiative updates.

### Projects (25 tools)

| Tool | Description | Key params |
|---|---|---|
| `search_projects` | Search/filter projects | `name`, `state` (planned/started/paused/completed/canceled), `filter` |
| `get_project` | Full project details | `id`*. Returns content, rich content state, direct comments, milestones, updates, members, issues. |
| `create_project` | Create project | `name`*, `teamIds`*, `description`, `content`, `statusId`, `state` (legacy resolver), `leadId`, `memberIds`, `startDate`, `targetDate`, `icon`, `color`, `priority`, `labelIds` |
| `update_project` | Update project | `id`*, `statusId`, `state` (legacy resolver), `description`, `content`, `icon`, `color`, `priority`, `leadId`, `memberIds`, `labelIds`, `startDate`, `targetDate`, `teamIds` |
| `archive_project` | Archive project | `id`*. Uses reversible Linear `projectDelete`. |
| `unarchive_project` | Restore archived project | `id`* |
| `list_project_statuses` | List workspace project statuses | `includeArchived`, pagination |
| `get_project_status` | Get one project status | `id`* |
| `create_project_status` | Create project status | `name`* (max 25 chars), `color`*, `position`*, `type`* (`backlog`/`planned`/`started`/`paused`/`completed`/`canceled`), `description`, `indefinite` |
| `update_project_status` | Update project status | `id`*, `name`, `color`, `description`, `position`, `type`, `indefinite` |
| `archive_project_status` | Archive project status | `id`*. Reassign projects first if status is in use. |
| `unarchive_project_status` | Restore project status | `id`* |
| `reassign_project_status` | Move all projects from one status to another | `originalProjectStatusId`*, `newProjectStatusId`* |
| `create_project_update` | Post status update | `projectId`*, `body` (markdown), `health` (onTrack/atRisk/offTrack) |
| `update_project_update` | Edit project status update | `id`*, `body`, `bodyData`, `health` |
| `archive_project_update` | Archive project status update | `id`* |
| `unarchive_project_update` | Restore project status update | `id`* |
| `create_project_relation` | Create project dependency relation | `type`* (`dependency`), `projectId`*, `anchorType`* (`start`/`end`/`milestone`), `relatedProjectId`*, `relatedAnchorType`* |
| `update_project_relation` | Update project dependency relation | `id`*, relation fields |
| `delete_project_relation` | Delete project relation | `id`* |
| `add_project_label` | Attach project label | `id`* (project UUID), `labelId`* |
| `remove_project_label` | Remove project label | `id`* (project UUID), `labelId`* |
| `create_project_milestone` | Create milestone | `projectId`*, `name`*, `description`, `targetDate` |
| `update_project_milestone` | Update milestone | `id`*, `name`, `description`, `targetDate` |
| `delete_project_milestone` | Delete milestone | `id`* |

**Tested findings:**
- Icon format is Slack-style `:emoji_name:` (e.g. `:rocket:`, `:test_tube:`). NOT Unicode emoji.
- Priority works (0-4 scale, same as issues).
- `get_project` returns `content`, `contentState`, `documentContent`, direct `comments`, labels, linked initiatives, `initiativeToProjects` link records, milestones, and updates.
- `get_project` returns project dependency `relations.nodes`.
- Project status is first-class: `create_project` / `update_project` should prefer `statusId`. Legacy `state` still works by resolving to an active `ProjectStatus.type` or status name.
- Linear current API removed `state` from `ProjectCreateInput` / `ProjectUpdateInput`; the MCP shim preserves the older user-facing parameter.
- Project status names must be <= 25 characters.
- `update_project(trashed: true)` produced a Linear internal error in testing. Use `archive_project` / `unarchive_project` instead.
- Personal smoke 2026-05-27: created disposable status/project, moved via `state` and `statusId`, reassigned status, archived/unarchived status and project.
- Project relation type is currently `dependency`; anchors are `start`, `end`, or `milestone`.
- Personal smoke 2026-05-27: project update edit/archive/unarchive, dependency relation create/update/read/delete, and project label add/remove all passed.

### Cycles (4 tools)

| Tool | Description | Key params |
|---|---|---|
| `list_cycles` | List cycles | `teamId`, `type` (current/next/previous), `filter` |
| `create_cycle` | Create cycle | `teamId`*, `startsAt`* (ISO datetime), `endsAt`*, `name`, `description` |
| `update_cycle` | Update cycle | `id`*, `name`, `description`, `startsAt`, `endsAt` |
| `cycle_archive` | Archive a cycle (added 2026-05-16) | `id`*. Uses `cycleArchive` mutation. Linear rejects archiving the active cycle. |

**Tested findings:**
- Add issues to cycles via `update_issue(cycleId: ...)`.
- Cycle issues visible in `list_cycles` response under `issues.nodes`.
- `type: "current"` filters by `startsAt <= now <= endsAt`.
- Cycle deletion not available via API. Use future dates to avoid polluting active sprints.

### Labels (4 tools)

| Tool | Description | Key params |
|---|---|---|
| `list_labels` | List issue labels | `teamId` (filter), `filter` (raw) |
| `create_issue_label` | Create issue label | `name`*, `description`, `color`, `isGroup` (true=parent), `parentId`, `teamId` |
| `create_project_label` | Create project label | `name`*, `description`, `color`, `isGroup`, `parentId` |
| `issue_label_retire` | Soft-delete / archive a label (added 2026-05-16) | `id`*. Uses `issueLabelArchive` mutation. Label disappears from pickers but historical assignments preserved. No hard-delete available. |

**Tested findings:**
- Label groups: create with `isGroup: true`, then children with `parentId`.
- Team-scoped labels: pass `teamId`. Omit for workspace-wide.
- Labels with descriptions render in Linear UI.
- Label deletion may not be available via API (use `issueLabelRetire` if needed).

### Initiatives (19 tools)

| Tool | Description | Key params |
|---|---|---|
| `list_initiatives` | List all initiatives | pagination |
| `get_initiative` | Get with projects, updates, content, and direct comments | `id`* |
| `create_initiative` | Create initiative | `name`*, `description`, `content`, `status` (Planned/Active/Completed), `ownerId`, `color`, `icon`, `targetDate`, `targetDateResolution`, `sortOrder`, `labelIds` |
| `update_initiative` | Update initiative | `id`*, `name`, `description`, `content`, `status`, `color`, `icon`, `targetDate`, `targetDateResolution`, `ownerId`, `sortOrder`, reminder fields, `labelIds` |
| `archive_initiative` | Archive initiative | `id`* |
| `unarchive_initiative` | Restore archived initiative | `id`* |
| `list_initiative_project_links` | List initiative-project link records | `initiativeId`, `projectId`, `includeArchived`, `first` |
| `link_initiative_project` | Link project | `initiativeId`*, `projectId`*, `sortOrder` |
| `update_initiative_project_link` | Update link record | `linkId` OR `initiativeId` + `projectId`; `sortOrder` |
| `unlink_initiative_project` | Unlink project (added 2026-05-16) | EITHER `linkId` (InitiativeToProject UUID), OR `initiativeId` + `projectId` (auto-looks-up link). Calls `initiativeToProjectDelete`. |
| `create_initiative_update` | Post status update | `initiativeId`*, `body` (markdown), `health` (onTrack/atRisk/offTrack) |
| `update_initiative_update` | Edit initiative status update | `id`*, `body`, `bodyData`, `health` |
| `archive_initiative_update` | Archive initiative status update | `id`* |
| `unarchive_initiative_update` | Restore initiative status update | `id`* |
| `create_initiative_relation` | Create initiative relation/sub-initiative link | `initiativeId`*, `relatedInitiativeId`*, `sortOrder`. Enterprise-gated in current workspaces. |
| `update_initiative_relation` | Update initiative relation | `id`*, `sortOrder`. Enterprise-gated in current workspaces. |
| `delete_initiative_relation` | Delete initiative relation | `id`*. Enterprise-gated in current workspaces. |
| `add_initiative_label` | Attach initiative label | `id`* (initiative UUID), `labelId`*. Feature-gated in personal workspace. |
| `remove_initiative_label` | Remove initiative label | `id`* (initiative UUID), `labelId`*. Feature-gated in personal workspace. |

**Tested findings:**
- One project can be linked to multiple initiatives. `get_project` returns both the initiative nodes and the `initiativeToProjects` records with link IDs/sort order.
- `initiativeToProject.sortOrder` reads back as a string even though the create/update input accepts a number.
- `get_initiative` returns projects, status updates, comments, and injected `initiativeToProjects` link records.
- Personal smoke 2026-05-27: linked one project to two initiatives, updated link sort order, verified readback from both sides, unlinked, and archived disposable records.
- Initiative statuses are exactly `Planned`, `Active`, `Completed`.
- Querying or mutating initiative labels currently fails in personal workspace with `Feature 'Initiative labels' is not enabled`; default initiative readback avoids labels.
- Initiative relations/sub-initiatives are Enterprise-gated in the current personal workspace.
- Personal smoke 2026-05-27: initiative update edit/archive/unarchive passed; initiative relation and label tools return clear feature-gate errors in current workspace.

**Tested findings:**
- Status transitions work: Planned → Active → Completed.
- Multiple projects can be linked to one initiative.
- Initiative updates field is `initiativeUpdates` (not `updates`).
- Can react to initiative updates via `create_reaction(initiativeUpdateId: ...)`.
- Direct initiative comments are not exposed as an inline `Initiative.comments` GraphQL field; `get_initiative` fetches them from the root `comments` connection and returns them as `comments.nodes`.

### Documents (5 tools)

| Tool | Description | Key params |
|---|---|---|
| `create_document` | Create document | `title`*, `content` (markdown), `projectId?`, `initiativeId?`, `teamId?`, `icon`, `color` |
| `update_document` | Update document | `id`*, `title`, `content`, `icon`, `color` |
| `get_document` | Read one document, including full markdown content, content state, and comments | `id`* |
| `search_documents` | Search/list documents | `projectId`, `initiativeId`, `filter` |
| `delete_document` | Delete document | `id`* |

**Tested findings:**
- Documents can be linked to projects, initiatives, or teams (mutually exclusive).
- Standalone documents (no link) may also work.
- Full markdown content supported.
- `search_documents` returns document metadata and `documentContentId`; use `get_document` when the body/content, content state, or comments are needed.
- Search by project returns only docs linked to that project.
- Document comments use `documentId` or `documentContentId` as the target. Add `quotedText` with `documentId` to create a selected-text/content comment with a GUI highlight; raw `documentContentId` cannot be source-anchored because Linear also needs `contentData` patched on the owning document.

### Files (10 tools)

These tools upload files into Linear private storage. They are distinct from URL/resource attachments.

| Tool | Description | Key params |
|---|---|---|
| `upload_file` | Upload one local file to Linear private storage | `path`* (absolute), `filename`, `contentType`, `makePublic`, `metaData`, `embedImages` |
| `upload_image_from_url` | Ask Linear to upload a public image URL | `url`*, `embedImages` |
| `create_comment_with_files` | Upload files and create a comment with markdown links/assets | `paths`*, one comment target, `body`, `parentId`, `quotedText` with `issueDescriptionId`/`documentId` for real inline anchors |
| `append_issue_files` | Upload files and append markdown links/assets to an issue description | `issueId`*, `paths`*, `heading` |
| `append_project_files` | Upload files and append markdown links/assets to project rich content | `projectId`*, `paths`*, `heading` |
| `append_initiative_files` | Upload files and append markdown links/assets to initiative rich content | `initiativeId`*, `paths`*, `heading` |
| `create_project_update_with_files` | Upload files and create a project status update containing markdown links/assets | `projectId`*, `paths`*, `body`, `health` |
| `create_initiative_update_with_files` | Upload files and create an initiative status update containing markdown links/assets | `initiativeId`*, `paths`*, `body`, `health` |
| `create_document_with_files` | Upload files and create a document containing markdown links/assets | `title`*, `paths`*, `content`, `projectId`, `initiativeId`, `teamId` |
| `update_document_with_files` | Upload files and append markdown links/assets to an existing document | `id`*, `paths`*, `content` |

**Tested findings:**
- Linear file upload flow is `fileUpload` -> signed `PUT` -> use returned `assetUrl` in markdown.
- Uploads must happen server-side; client/browser `PUT` requests are blocked by CSP.
- The signed `PUT` must copy headers returned by `fileUpload`; otherwise Linear storage can return 403.
- `UploadFile.filename` can be a storage key rather than the original filename. The MCP returns the local/display `filename` separately and preserves Linear's value as `storageFilename`.
- Image files return `![filename](assetUrl)` markdown by default. Other files return `[filename](assetUrl)`.
- Filename labels are escaped for markdown (`[`, `]`, `\`, newlines) before embedding.
- Observed Linear GUI behavior: non-image uploads render as Linear file cards when the asset URL is its own markdown paragraph; images render inline from `![filename](assetUrl)`.
- File helpers were smoke-tested on issue descriptions, issue comments, direct project comments, direct initiative comments, document comments, project/initiative rich content, and project/initiative status updates.
- Use `create_comment_with_files` with `issueDescriptionId`/`documentId` plus `quotedText` when the files belong to an inline selected-text comment; this now patches the source rich-text state so Linear shows a yellow source highlight instead of a stale quote card.
- Existing URL/resource attachment tools remain under Attachments and should not be used for binary upload.

### Custom Views (6 tools)

| Tool | Description | Key params |
|---|---|---|
| `list_views` | List saved custom views | pagination |
| `get_view` | Get view with filter config | `id`* |
| `create_view` | Create saved view/filter | `name`*, `description`, `icon`, `color`, `teamId?`, `projectId?`, `initiativeId?`, `ownerId?`, `shared`, `filterData` (IssueFilter), `projectFilterData` (ProjectFilter), `initiativeFilterData` (InitiativeFilter), `feedItemFilterData` |
| `update_view` | Update view | `id`*, `name`, `description`, scope fields, `filterData`, `projectFilterData`, `initiativeFilterData`, `feedItemFilterData`, `shared` |
| `delete_view` | Delete view | `id`* |
| `set_view_preferences` | Set layout, grouping, ordering, display fields | `customViewId`*, `preferences` (object), `type` ("organization" or "user") |

**Tested findings:**
- Updated 2026-05-26: `CustomView` now exposes `projects` and `initiatives` connections, not singular `project` / `initiative` fields. `list_views` and `get_view` query `projects.nodes` and `initiatives.nodes`.
- Updated 2026-05-27: `list_views` / `get_view` return `initiativeFilterData`, `feedItemFilterData`, and user/org view preference summaries.
- `filterData` accepts full IssueFilter objects (e.g. `{ assignee: { isMe: { eq: true } }, priority: { in: [1,2] } }`).
- `initiativeFilterData` works for initiative views (e.g. `{ status: { eq: "Active" } }`).
- Workspace-level views: omit `teamId` and set `shared: true`.
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
- Personal smoke 2026-05-27: created/deleted workspace-level shared issue, project, and initiative views; set org preferences for issue/project views; verified readback.

### Notifications (1 tool)

| Tool | Description | Key params |
|---|---|---|
| `list_notifications` | Inbox notifications | `includeArchived` (bool), pagination. Returns `unreadCount` + notification nodes. |

**Tested findings:**
- Returns unread count alongside notification list.
- Notification types include: `issueStatusChanged`, `issueNewComment`, `issueCommentReaction`, `issuePriorityUrgent`.
- `IssueNotification` nodes include `issue`, `comment`, `actor` fields.

### Teams (2 tools)

| Tool | Description | Key params |
|---|---|---|
| `get_teams` | List teams + members + cycle/estimate/triage config | `include` (array: "states", "labels"). Now returns `cycleCalenderUrl`, `cycleStartDay`, `cycleDuration`, `cycleCooldownTime`, `cycleIssueAutoAssignStarted`, `cycleIssueAutoAssignCompleted`, `cycleLockToActive`, `upcomingCycleCount`, `issueEstimationType`, `issueEstimationExtended`, `issueEstimationAllowZero`, `defaultIssueEstimate`, `triageEnabled`, `requirePriorityToLeaveTriage`. |
| `update_team` | Update team config (added 2026-05-16) | `id`*, plus any of: `cyclesEnabled`, `cycleStartDay`, `cycleDuration`, `cycleCooldownTime`, `cycleIssueAutoAssignStarted`, `cycleIssueAutoAssignCompleted`, `cycleLockToActive`, `upcomingCycleCount`, `issueEstimationType` (`notUsed | exponential | fibonacci | linear | tShirt`), `issueEstimationExtended`, `issueEstimationAllowZero`, `defaultIssueEstimate`, `triageEnabled`, `requirePriorityToLeaveTriage`, plus name/key/description. |

**Tested findings:**
- `Team.cycleCalenderUrl` is the per-team iCalendar feed URL — subscribable in Google Calendar with no auth (UUIDs in the URL are the secret).
- `cycleCalenderUrl` can be empty or stale; Linear's feed sometimes returns "Sorry, you must re-create this calendar" placeholder events — fix is to regenerate in the Linear UI (Team Settings → Cycles).
- `update_team`: `defaultIssueEstimate` is API-capped to 0 or 1 only. Setting 2+ returns `defaultIssueEstimate must be one of the following values: 0, 1`.
- `issueEstimationType` accepts the string enum exactly: `notUsed`, `exponential`, `fibonacci`, `linear`, `tShirt`.

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

### Attachments (5 tools)

| Tool | Description | Key params |
|---|---|---|
| `create_attachment` | Attach a URL/resource to an issue | `issueId`*, `title`*, `url`*, `subtitle`, `iconUrl`, `metadata` (JSON), `commentBody` |
| `update_attachment` | Update attachment properties | `id`*, `title`, `subtitle`, `url`, `metadata` |
| `delete_attachment` | Delete an attachment | `id`* |
| `link_attachment_url` | Simplified URL linking with auto-detected metadata | `issueId`*, `url`*, `title` |
| `link_attachment_discord` | Link a Discord message (requires Discord OAuth in workspace) | `issueId`*, `channelId`*, `messageId`*, `url`*, `title` |

**Tested findings:**
- `commentBody` on `create_attachment` auto-creates a comment on the issue with the given body text.
- `metadata` is free-form JSON. Useful for storing source context (e.g., Discord channel, Notion page ID).
- `link_attachment_discord` requires Discord OAuth integration in the Linear workspace. Returns "Unknown integration" error without it. Use `create_attachment` with a Discord URL as fallback.
- Without `title`, `link_attachment_discord` defaults to "Discord message". Subtitle is generic Discord boilerplate, not the actual message content.
- `link_attachment_url` sets `sourceType: "api"`. `create_attachment` sets `sourceType: "unknown"`.
- Multiple attachments per issue supported. Visible in `get_issue` under `attachments.nodes`.
- `iconUrl` accepts any URL (e.g., `https://cdn.simpleicons.org/discord`).

### Templates (5 tools, added 2026-05-16)

| Tool | Description | Key params |
|---|---|---|
| `list_templates` | List workspace templates, or team templates when scoped | `teamId?` |
| `get_template` | Get one template | `id`* |
| `create_template` | Create template (issue / project / **recurringIssue** / document / releaseNote) | `name`*, `type`*, `teamId`, `description`, `icon`, `color`, `sortOrder`, `templateData`* (object OR JSON string). For `recurringIssue` type, **MUST include `schedule` inside templateData**. |
| `update_template` | Update template | `id`*, `name`, `description`, `icon`, `color`, `teamId`, `sortOrder`, `templateData` |
| `delete_template` | Hard-delete template | `id`* |

**Tested findings:**
- `templateData` is sent as a JSON-encoded string on the wire. The MCP tool accepts either a plain object (auto-stringified) or a pre-encoded string.
- **Recurring issue schedule lives inside `templateData.schedule`**. Format: `{ interval: 1, type: "days" | "weeks" | "months" | "years", startAt: "YYYY-MM-DD", lastRecurredAt: "YYYY-MM-DD" }`. `lastRecurredAt` is server-managed.
- Without `schedule`, `recurringIssue` template creation fails: `userPresentableMessage: "The recurring issue template must have a schedule."`
- Working example payload (USt-VA monthly, first due Jun 10): `templateData: {title, priority, teamId, assigneeId, schedule: {interval: 1, type: "months", startAt: "2026-06-10"}}`.
- `Template.team`, `Template.organization`, `Template.creator` are object refs — query `{ id name }` not `teamId`/`organizationId` strings.
- `templates` query returns workspace templates as a plain array, not a paginated connection. `team(id).templates.nodes` is still used when `teamId` is supplied.
- Workspace-level project templates work with `teamId` omitted (`team: null`).
- Personal smoke 2026-05-27: listed workspace and team templates, created/updated/deleted a far-future recurringIssue template, and created/deleted a workspace-level project template.

### Batch Operations (2 tools)

| Tool | Description | Key params |
|---|---|---|
| `issue_batch_create` | Create multiple issues in one call | `issues[]` (array of IssueCreateInput, each needs `teamId` + `title`) |
| `issue_batch_update` | Apply same update to multiple issues | `ids[]` (UUIDs), plus any IssueUpdateInput field |

**Tested findings:**
- Supports all `create_issue` fields including `parentId` (sub-issues), `priority`, `dueDate`, `labelIds`.
- Cross-team batch create works: different `teamId` per issue in the same call.
- Batch update applies identical changes to all listed IDs. Supports `null` to clear optional fields.
- Batch update supports `addedLabelIds`, `removedLabelIds`, `projectId`, `cycleId`, etc.

---

## Known Limitations

1. **No `startDate` on issues** — only `dueDate`. Projects have `startDate`.
2. **No project deletion** — only `update_project(state: "canceled")`.
3. **No cycle hard-delete** — `cycle_archive` is soft-archive only. Cannot archive the active cycle.
4. **No label hard-delete** — `issue_label_retire` is soft-archive only.
5. ~~No issue templates~~ — **resolved 2026-05-16**: full `templateCreate`/`templateUpdate`/`templateDelete` CRUD exposed including `recurringIssue` schedule.
6. **No notification management** — `notificationArchive`, `notificationMarkReadAll` exist but not yet implemented.
7. **No workflow state management** — states are read via `get_teams(include: ["states"])` but cannot be created/updated.
8. **Initiative description max 255 chars** — use `content` field for longer rich body (markdown).
9. **One comment thread per update** — project/initiative updates allow only one top-level comment. Use `parentId` for replies within that thread.
10. **Project description field is `content`** — not `description` on `ProjectUpdateInput`. Same for initiatives.
11. **Markdown in description/body fields** — use actual newlines in the string, not literal `\n`. The `description` and `body` params accept markdown and render it in Linear. Escaped `\\n` shows as literal `\n` text in the UI.
12. **`defaultIssueEstimate` API-capped to 0 or 1** — higher values rejected even though individual issues accept any value.
13. **`issueReminder` archive-suppressed** — archived issues do not fire pending reminders. No `IssueReminder` standalone type exposed; reminders are write-only via mutation, read via `list_notifications` after firing.
14. **Snooze GUI gap** — `snoozedUntilAt` is API-settable on any issue but the Linear GUI exposes the snooze affordance only in Triage/Inbox lists and the issue header clock-icon. Non-Triage list right-click and the `H` shortcut outside Triage do not surface snooze.
15. **Cycle ICS feeds can go stale** — `Team.cycleCalenderUrl` may return "Sorry, you must re-create this calendar by visiting the team in Linear" placeholder events. Fix is GUI-only: regenerate in Team Settings → Cycles.

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
