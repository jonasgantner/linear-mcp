import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP, PAGINATION_PROPS } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'

const LIST_NOTIFICATIONS_QUERY = `
  query ListNotifications($first: Int, $after: String, $includeArchived: Boolean) {
    notifications(first: $first, after: $after, includeArchived: $includeArchived) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id type readAt snoozedUntilAt createdAt
        ... on IssueNotification {
          issue { id identifier title state { name } priority assignee { name } }
          comment { id body }
          actor { name }
        }
        ... on ProjectNotification {
          project { id name }
          actor { name }
        }
      }
    }
  }
`

const UNREAD_COUNT_QUERY = `
  query UnreadCount {
    notificationsUnreadCount
  }
`

export const notificationTools: ToolDef[] = [
  {
    name: 'list_notifications',
    description: 'List inbox notifications (issue updates, comments, reactions, assignments). Shows unread by default.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        includeArchived: { type: 'boolean', description: 'Include archived/read notifications (default: false)' },
        ...PAGINATION_PROPS,
      },
    },
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
]
