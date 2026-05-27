import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP, PAGINATION_PROPS } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'

const ISSUE_FIELDS = `
  id identifier title description url priority priorityLabel estimate
  dueDate slaBreachesAt snoozedUntilAt
  snoozedBy { id name }
  state { id name type color }
  assignee { id name email }
  team { id name key }
  project { id name }
  projectMilestone { id name targetDate }
  cycle { id number name startsAt endsAt }
  parent { id identifier title }
  labels { nodes { id name color } }
  createdAt updatedAt completedAt canceledAt
`

const SEARCH_ISSUES_QUERY = `
  query SearchIssues($filter: IssueFilter, $first: Int, $after: String, $orderBy: PaginationOrderBy) {
    issues(filter: $filter, first: $first, after: $after, orderBy: $orderBy) {
      pageInfo { hasNextPage endCursor }
      nodes { ${ISSUE_FIELDS} }
    }
  }
`

const GET_ISSUE_QUERY = `
  query GetIssue($id: String!) {
    issue(id: $id) {
      ${ISSUE_FIELDS}
      descriptionState
      documentContent { id contentState updatedAt }
      children { nodes { id identifier title state { name } priority } }
      attachments { nodes { id title subtitle url sourceType metadata createdAt } }
      comments {
        nodes {
          id body quotedText url
          issueId projectId initiativeId documentContentId projectUpdateId initiativeUpdateId parentId
          user { name }
          createdAt updatedAt resolvedAt
          parent { id }
          children { nodes { id body quotedText user { name } createdAt } }
        }
      }
      relations { nodes { id type relatedIssue { id identifier title } } }
      inverseRelations { nodes { id type issue { id identifier title } } }
    }
  }
`

const GET_DOCUMENT_CONTENT_COMMENTS_QUERY = `
  query GetDocumentContentComments($documentContentId: ID!) {
    comments(filter: { documentContent: { id: { eq: $documentContentId } } }, first: 50) {
      nodes {
        id body quotedText url
        issueId projectId initiativeId documentContentId projectUpdateId initiativeUpdateId parentId
        user { name }
        createdAt updatedAt resolvedAt
      }
    }
  }
`

const CREATE_ISSUE_MUTATION = `
  mutation CreateIssue($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue { id identifier title url team { key } state { name } assignee { name } }
    }
  }
`

const UPDATE_ISSUE_MUTATION = `
  mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) {
      success
      issue {
        id identifier title url priority
        state { name }
        assignee { name }
        snoozedUntilAt snoozedBy { id name }
        dueDate estimate
      }
    }
  }
`

const DELETE_ISSUE_MUTATION = `
  mutation DeleteIssue($id: String!) {
    issueDelete(id: $id) { success }
  }
`

const ISSUE_REMINDER_MUTATION = `
  mutation IssueReminder($id: String!, $reminderAt: DateTime!) {
    issueReminder(id: $id, reminderAt: $reminderAt) {
      success lastSyncId
    }
  }
`

const ARCHIVE_ISSUE_MUTATION = `
  mutation ArchiveIssue($id: String!) {
    issueArchive(id: $id) { success }
  }
`

const UNARCHIVE_ISSUE_MUTATION = `
  mutation UnarchiveIssue($id: String!) {
    issueUnarchive(id: $id) { success }
  }
`

function buildIssueFilter(args: Record<string, unknown>): Record<string, unknown> {
  if (args.filter) return args.filter as Record<string, unknown>
  const filter: Record<string, unknown> = {}
  if (args.state) filter.state = { name: { eqIgnoreCase: args.state } }
  if (args.assignee === 'me') {
    filter.assignee = { isMe: { eq: true } }
  } else if (args.assignee) {
    filter.assignee = { name: { containsIgnoreCase: args.assignee } }
  }
  if (args.label) filter.labels = { name: { eq: args.label } }
  if (args.team) filter.team = { key: { eq: args.team } }
  if (args.project) filter.project = { name: { containsIgnoreCase: args.project } }
  if (args.priority != null) filter.priority = { eq: args.priority }
  if (args.query) {
    filter.or = [
      { title: { containsIgnoreCase: args.query } },
      { description: { containsIgnoreCase: args.query } },
    ]
  }
  return filter
}

export const issueTools: ToolDef[] = [
  {
    name: 'search_issues',
    description: 'Search and filter issues. Supports convenience params (state, assignee, label, team, project, priority, query) or a raw IssueFilter object for advanced filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        state: { type: 'string', description: 'Filter by state name (e.g. "In Progress", "Todo", "Done")' },
        assignee: { type: 'string', description: 'Filter by assignee name or "me" for authenticated user' },
        label: { type: 'string', description: 'Filter by label name' },
        team: { type: 'string', description: 'Filter by team key (e.g. "SPE", "PRO")' },
        project: { type: 'string', description: 'Filter by project name (partial match)' },
        priority: { type: 'integer', description: 'Filter by priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low' },
        query: { type: 'string', description: 'Full-text search in title and description' },
        filter: { type: 'object', description: 'Raw IssueFilter object (overrides convenience params)' },
        ...PAGINATION_PROPS,
        orderBy: { type: 'string', description: 'Sort: updatedAt (default), createdAt, priority' },
      },
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const filter = buildIssueFilter(args)
      const variables: Record<string, unknown> = {
        filter: Object.keys(filter).length > 0 ? filter : undefined,
        first: (args.first as number) || 50,
        after: args.after as string | undefined,
        orderBy: args.orderBy || 'updatedAt',
      }
      const data = await client.query(SEARCH_ISSUES_QUERY, variables)
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'get_issue',
    description: 'Get a single issue by ID or identifier (e.g. "SPE-123"). Returns full details including comments, children, and relations.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Issue UUID or identifier (e.g. "SPE-123")' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query<{
        issue: { documentContent?: { id: string } | null; documentContentComments?: unknown }
      }>(GET_ISSUE_QUERY, { id: args.id })
      const documentContentId = data.issue.documentContent?.id
      if (documentContentId) {
        const comments = await client.query(GET_DOCUMENT_CONTENT_COMMENTS_QUERY, { documentContentId })
        data.issue.documentContentComments = (comments as { comments: unknown }).comments
      }
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'create_issue',
    description: 'Create a new issue. Requires teamId and title at minimum.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        teamId: { type: 'string', description: 'Team UUID (required)' },
        title: { type: 'string', description: 'Issue title (required)' },
        description: { type: 'string', description: 'Issue description (markdown)' },
        priority: { type: 'integer', description: '0=none, 1=urgent, 2=high, 3=medium, 4=low' },
        stateId: { type: 'string', description: 'Workflow state UUID' },
        assigneeId: { type: 'string', description: 'Assignee user UUID' },
        labelIds: { type: 'array', items: { type: 'string' }, description: 'Label UUIDs' },
        cycleId: { type: 'string', description: 'Cycle UUID' },
        projectId: { type: 'string', description: 'Project UUID' },
        estimate: { type: 'number', description: 'Point estimate' },
        dueDate: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
        parentId: { type: 'string', description: 'Parent issue UUID for sub-issues' },
      },
      required: ['teamId', 'title'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, ...input } = args
      const data = await client.query(CREATE_ISSUE_MUTATION, { input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'update_issue',
    description: 'Update an existing issue. Pass the issue ID and any fields to change.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Issue UUID or identifier' },
        title: { type: 'string', description: 'New title' },
        description: { type: 'string', description: 'New description (markdown)' },
        priority: { type: 'integer', description: '0=none, 1=urgent, 2=high, 3=medium, 4=low' },
        stateId: { type: 'string', description: 'New workflow state UUID' },
        assigneeId: { type: 'string', description: 'New assignee user UUID' },
        labelIds: { type: 'array', items: { type: 'string' }, description: 'Label UUIDs (replaces all)' },
        addedLabelIds: { type: 'array', items: { type: 'string' }, description: 'Label UUIDs to add (without replacing existing)' },
        removedLabelIds: { type: 'array', items: { type: 'string' }, description: 'Label UUIDs to remove' },
        cycleId: { type: 'string', description: 'Cycle UUID' },
        projectId: { type: 'string', description: 'Project UUID. Set to null through raw JSON to clear if Linear accepts the clear.' },
        projectMilestoneId: { type: 'string', description: 'Project milestone UUID. Set to null through raw JSON to remove from a milestone if Linear accepts the clear.' },
        estimate: { type: 'number', description: 'Point estimate' },
        dueDate: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
        parentId: { type: 'string', description: 'Parent issue UUID' },
        teamId: { type: 'string', description: 'Team UUID (move issue to different team)' },
        snoozedUntilAt: { type: 'string', description: 'Snooze the issue until this datetime (ISO 8601). Set to null to unsnooze. Hides from default views; surfaces again via showSnoozedItems view preference.' },
        snoozedById: { type: 'string', description: 'User UUID who snoozed the issue (server normally sets this to the actor automatically)' },
      },
      required: ['id'],
    },
    examples: [
      {
        title: 'Move to project milestone',
        args: {
          workspace: 'personal',
          id: 'issue-uuid',
          projectId: 'project-uuid',
          projectMilestoneId: 'milestone-uuid',
        },
      },
      {
        title: 'Add/remove labels by ID',
        args: {
          workspace: 'personal',
          id: 'issue-uuid',
          addedLabelIds: ['label-uuid'],
          removedLabelIds: ['old-label-uuid'],
        },
      },
    ],
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, id, ...input } = args
      const data = await client.query(UPDATE_ISSUE_MUTATION, { id, input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'issue_reminder',
    description: 'Set a personal reminder on an issue. Fires as an inbox notification at `reminderAt` (type: issueReminder). Works on any issue regardless of state, but archived issues do NOT fire reminders. Calling again on the same issue overrides the prior reminder.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Issue UUID or identifier (e.g. "J-297")' },
        reminderAt: { type: 'string', description: 'When to fire the reminder, ISO 8601 datetime (e.g. "2026-05-17T09:00:00.000Z")' },
      },
      required: ['id', 'reminderAt'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(ISSUE_REMINDER_MUTATION, { id: args.id, reminderAt: args.reminderAt })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'delete_issue',
    description: 'Permanently delete an issue.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Issue UUID or identifier' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(DELETE_ISSUE_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'archive_issue',
    description: 'Archive an issue (soft delete, can be unarchived).',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Issue UUID or identifier' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(ARCHIVE_ISSUE_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'unarchive_issue',
    description: 'Unarchive a previously archived issue.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Issue UUID or identifier' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(UNARCHIVE_ISSUE_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
]
