import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP, PAGINATION_PROPS } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'
import { COMMENT_READ_FIELDS } from './commentRead.js'

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

const ISSUE_SUBSCRIBER_FIELDS = `
  subscribers(first: 250) {
    pageInfo { hasNextPage endCursor }
    nodes { id name email active }
  }
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
      ${ISSUE_SUBSCRIBER_FIELDS}
      descriptionState
      documentContent { id contentState updatedAt }
      children { nodes { id identifier title state { name } priority } }
      attachments { nodes { id title subtitle url sourceType metadata createdAt } }
      relations { nodes { id type relatedIssue { id identifier title } } }
      inverseRelations { nodes { id type issue { id identifier title } } }
    }
  }
`

const GET_ISSUE_COMMENTS_QUERY = `
  query GetIssueComments($issueId: ID!) {
    comments(filter: { issue: { id: { eq: $issueId } } }, first: 25) {
      nodes {
        ${COMMENT_READ_FIELDS}
      }
    }
  }
`

const GET_DOCUMENT_CONTENT_COMMENTS_QUERY = `
  query GetDocumentContentComments($documentContentId: ID!) {
    comments(filter: { documentContent: { id: { eq: $documentContentId } } }, first: 25) {
      nodes {
        ${COMMENT_READ_FIELDS}
      }
    }
  }
`

const CREATE_ISSUE_MUTATION = `
  mutation CreateIssue($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue {
        ${ISSUE_FIELDS}
        ${ISSUE_SUBSCRIBER_FIELDS}
      }
    }
  }
`

const UPDATE_ISSUE_MUTATION = `
  mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) {
      success
      issue {
        ${ISSUE_FIELDS}
        ${ISSUE_SUBSCRIBER_FIELDS}
      }
    }
  }
`

const ISSUE_SUBSCRIBERS_QUERY = `
  query IssueSubscribers($id: String!, $first: Int, $after: String) {
    issue(id: $id) {
      id identifier title
      subscribers(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { id name email active }
      }
    }
  }
`

const VIEWER_QUERY = `
  query Viewer {
    viewer { id name email active }
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

async function resolveSubscriberUserId(client: LinearClient, userId: unknown): Promise<string> {
  if (typeof userId === 'string' && userId) return userId
  const data = await client.query<{ viewer: { id: string } }>(VIEWER_QUERY)
  return data.viewer.id
}

async function getIssueSubscriberIds(client: LinearClient, issueId: unknown): Promise<string[]> {
  const data = await client.query<{
    issue: { subscribers: { nodes: Array<{ id: string }> } }
  }>(ISSUE_SUBSCRIBERS_QUERY, { id: issueId, first: 250 })
  return data.issue.subscribers.nodes.map(user => user.id)
}

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
        issue: { id: string; comments?: unknown; documentContent?: { id: string } | null; documentContentComments?: unknown }
      }>(GET_ISSUE_QUERY, { id: args.id })
      const issueComments = await client.query(GET_ISSUE_COMMENTS_QUERY, { issueId: data.issue.id })
      data.issue.comments = (issueComments as { comments: unknown }).comments
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
    description: 'Create a new issue. Requires teamId and title at minimum. Supports the same routine organization fields as update_issue, including projectMilestoneId and subscriberIds.',
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
        projectMilestoneId: { type: 'string', description: 'Project milestone UUID' },
        estimate: { type: 'number', description: 'Point estimate' },
        dueDate: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
        parentId: { type: 'string', description: 'Parent issue UUID for sub-issues' },
        subscriberIds: { type: 'array', items: { type: 'string' }, description: 'Subscriber/watcher user UUIDs' },
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
    description: 'Update an existing issue. Pass the issue ID and any fields to change. Nullable fields that Linear accepts can be cleared with raw JSON null: assigneeId, cycleId, projectId, projectMilestoneId, parentId, dueDate, estimate, and snoozedUntilAt.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Issue UUID or identifier' },
        title: { type: 'string', description: 'New title' },
        description: { type: 'string', description: 'New description (markdown)' },
        priority: { type: 'integer', description: '0=none, 1=urgent, 2=high, 3=medium, 4=low' },
        stateId: { type: 'string', description: 'New workflow state UUID' },
        assigneeId: { type: ['string', 'null'], description: 'New assignee user UUID, or null to unassign' },
        labelIds: { type: 'array', items: { type: 'string' }, description: 'Label UUIDs (replaces all)' },
        addedLabelIds: { type: 'array', items: { type: 'string' }, description: 'Label UUIDs to add (without replacing existing)' },
        removedLabelIds: { type: 'array', items: { type: 'string' }, description: 'Label UUIDs to remove' },
        cycleId: { type: ['string', 'null'], description: 'Cycle UUID, or null to remove from cycle' },
        projectId: { type: ['string', 'null'], description: 'Project UUID to move the issue between projects, or null to clear project' },
        projectMilestoneId: { type: ['string', 'null'], description: 'Project milestone UUID, or null to remove from milestone' },
        estimate: { type: ['number', 'null'], description: 'Point estimate, or null to clear estimate' },
        dueDate: { type: ['string', 'null'], description: 'Due date (YYYY-MM-DD), or null to clear due date' },
        parentId: { type: ['string', 'null'], description: 'Parent issue UUID, or null to detach from parent' },
        teamId: { type: 'string', description: 'Team UUID (move issue to different team)' },
        subscriberIds: { type: 'array', items: { type: 'string' }, description: 'Subscriber/watcher user UUIDs (replaces all subscribers). Prefer subscribe_issue/unsubscribe_issue for additive changes.' },
        snoozedUntilAt: { type: ['string', 'null'], description: 'Snooze the issue until this datetime (ISO 8601). Set to null to unsnooze. Hides from default views; surfaces again via showSnoozedItems view preference.' },
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
        title: 'Clear organization fields',
        description: 'Use JSON null to clear nullable issue fields that Linear supports.',
        args: {
          workspace: 'personal',
          id: 'issue-uuid',
          assigneeId: null,
          projectId: null,
          projectMilestoneId: null,
          cycleId: null,
          parentId: null,
          dueDate: null,
          estimate: null,
          snoozedUntilAt: null,
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
    name: 'list_issue_subscribers',
    description: 'List subscribers/watchers on an issue. Use this before replacing subscriberIds directly.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Issue UUID or identifier' },
        ...PAGINATION_PROPS,
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(ISSUE_SUBSCRIBERS_QUERY, {
        id: args.id,
        first: (args.first as number) || 50,
        after: args.after as string | undefined,
      })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'subscribe_issue',
    description: 'Subscribe/watch an issue by adding a user to its subscriberIds. Omits userId to subscribe the authenticated Linear user. Idempotent: keeps existing subscribers.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Issue UUID or identifier' },
        userId: { type: 'string', description: 'User UUID to subscribe. Defaults to the authenticated user.' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const userId = await resolveSubscriberUserId(client, args.userId)
      const current = await getIssueSubscriberIds(client, args.id)
      const subscriberIds = current.includes(userId) ? current : [...current, userId]
      const data = await client.query(UPDATE_ISSUE_MUTATION, { id: args.id, input: { subscriberIds } })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'unsubscribe_issue',
    description: 'Unsubscribe/unwatch an issue by removing a user from its subscriberIds. Omits userId to unsubscribe the authenticated Linear user. Idempotent: keeps other subscribers.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Issue UUID or identifier' },
        userId: { type: 'string', description: 'User UUID to unsubscribe. Defaults to the authenticated user.' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const userId = await resolveSubscriberUserId(client, args.userId)
      const current = await getIssueSubscriberIds(client, args.id)
      const subscriberIds = current.filter(id => id !== userId)
      const data = await client.query(UPDATE_ISSUE_MUTATION, { id: args.id, input: { subscriberIds } })
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
