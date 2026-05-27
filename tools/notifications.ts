import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP, PAGINATION_PROPS } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'

const NOTIFICATION_FIELDS = `
  id type readAt archivedAt snoozedUntilAt createdAt updatedAt
  url inboxUrl title subtitle category
  actor { id name }
  user { id name email }
  ... on IssueNotification {
    issueId
    issue { id identifier title state { name } priority assignee { name } }
    comment { id body }
    team { id name key }
    subscriptions { id active subscriber { id name email } }
  }
  ... on ProjectNotification {
    projectId
    projectUpdateId
    project { id name }
    actor { id name }
  }
`

const LIST_NOTIFICATIONS_QUERY = `
  query ListNotifications($first: Int, $after: String, $includeArchived: Boolean) {
    notifications(first: $first, after: $after, includeArchived: $includeArchived) {
      pageInfo { hasNextPage endCursor }
      nodes {
        ${NOTIFICATION_FIELDS}
      }
    }
  }
`

const GET_NOTIFICATION_QUERY = `
  query GetNotification($id: String!) {
    notification(id: $id) {
      ${NOTIFICATION_FIELDS}
    }
  }
`

const UNREAD_COUNT_QUERY = `
  query UnreadCount {
    notificationsUnreadCount
  }
`

const UPDATE_NOTIFICATION_MUTATION = `
  mutation UpdateNotification($id: String!, $input: NotificationUpdateInput!) {
    notificationUpdate(id: $id, input: $input) {
      success
      lastSyncId
      notification {
        ${NOTIFICATION_FIELDS}
      }
    }
  }
`

const ARCHIVE_NOTIFICATION_MUTATION = `
  mutation ArchiveNotification($id: String!) {
    notificationArchive(id: $id) {
      success
      lastSyncId
      entity {
        ${NOTIFICATION_FIELDS}
      }
    }
  }
`

const UNARCHIVE_NOTIFICATION_MUTATION = `
  mutation UnarchiveNotification($id: String!) {
    notificationUnarchive(id: $id) {
      success
      lastSyncId
      entity {
        ${NOTIFICATION_FIELDS}
      }
    }
  }
`

export const notificationTools: ToolDef[] = [
  {
    name: 'list_notifications',
    description: 'List inbox notifications (issue updates, comments, reactions, assignments). Shows unread/unarchived by default and includes unreadCount.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        includeArchived: { type: 'boolean', description: 'Include archived/read notifications (default: false)' },
        ...PAGINATION_PROPS,
      },
    },
    examples: [
      {
        title: 'Unread inbox',
        args: { workspace: 'personal', includeArchived: false, first: 25 },
      },
      {
        title: 'Archived/read notifications',
        args: { workspace: 'personal', includeArchived: true, first: 25 },
      },
    ],
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const countData = await client.query<{ notificationsUnreadCount: number }>(UNREAD_COUNT_QUERY)
      const data = await client.query(LIST_NOTIFICATIONS_QUERY, {
        first: (args.first as number) || 25,
        after: args.after as string | undefined,
        includeArchived: args.includeArchived ?? false,
      })
      return JSON.stringify({ unreadCount: countData.notificationsUnreadCount, ...data as Record<string, unknown> }, null, 2)
    },
  },
  {
    name: 'get_notification',
    description: 'Get a single inbox notification by UUID with read/archive state and linked issue/project context.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Notification UUID' },
      },
      required: ['id'],
    },
    examples: [
      {
        title: 'Inspect notification',
        args: { workspace: 'personal', id: 'notification-uuid' },
      },
    ],
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(GET_NOTIFICATION_QUERY, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'update_notification',
    description: 'Low-level notification update. Set readAt to an ISO datetime to mark read, readAt to null to mark unread, or snoozedUntilAt to snooze/unsnooze where Linear supports it.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Notification UUID' },
        readAt: { type: ['string', 'null'], description: 'Read timestamp, or null to mark unread' },
        snoozedUntilAt: { type: ['string', 'null'], description: 'Snooze timestamp, or null to unsnooze' },
        projectUpdateId: { type: 'string', description: 'Project update UUID for supported project notifications' },
        initiativeUpdateId: { type: 'string', description: 'Initiative update UUID for supported initiative notifications' },
      },
      required: ['id'],
    },
    examples: [
      {
        title: 'Mark read at explicit time',
        args: { workspace: 'personal', id: 'notification-uuid', readAt: '2026-05-27T12:00:00.000Z' },
      },
      {
        title: 'Mark unread',
        args: { workspace: 'personal', id: 'notification-uuid', readAt: null },
      },
    ],
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, id, ...input } = args
      const data = await client.query(UPDATE_NOTIFICATION_MUTATION, { id, input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'mark_notification_read',
    description: 'Mark one notification as read. Defaults readAt to the current time.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Notification UUID' },
        readAt: { type: 'string', description: 'Optional read timestamp. Defaults to now.' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(UPDATE_NOTIFICATION_MUTATION, {
        id: args.id,
        input: { readAt: (args.readAt as string | undefined) ?? new Date().toISOString() },
      })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'mark_notification_unread',
    description: 'Mark one notification as unread by clearing readAt.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Notification UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(UPDATE_NOTIFICATION_MUTATION, { id: args.id, input: { readAt: null } })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'archive_notification',
    description: 'Archive one inbox notification. Reversible with unarchive_notification.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Notification UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(ARCHIVE_NOTIFICATION_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'unarchive_notification',
    description: 'Restore one archived inbox notification.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Notification UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(UNARCHIVE_NOTIFICATION_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
]
