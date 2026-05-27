import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP, PAGINATION_PROPS } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'

const LIST_VIEWS_QUERY = `
  query ListCustomViews($first: Int, $after: String) {
    customViews(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id name description icon color shared
        owner { id name }
        team { id name key }
        projects { nodes { id name } }
        initiatives { nodes { id name } }
        filterData
        projectFilterData
        initiativeFilterData
        feedItemFilterData
        userViewPreferences {
          id type viewType
          preferences { layout projectLayout issueGrouping projectGrouping viewOrdering projectViewOrdering }
        }
        organizationViewPreferences {
          id type viewType
          preferences { layout projectLayout issueGrouping projectGrouping viewOrdering projectViewOrdering }
        }
        createdAt updatedAt
      }
    }
  }
`

const GET_VIEW_QUERY = `
  query GetCustomView($id: String!) {
    customView(id: $id) {
      id name description icon color shared
      owner { id name }
      team { id name key }
      projects { nodes { id name } }
      initiatives { nodes { id name } }
      filterData
      projectFilterData
      initiativeFilterData
      feedItemFilterData
      userViewPreferences {
        id type viewType
        preferences { layout projectLayout issueGrouping projectGrouping viewOrdering projectViewOrdering }
      }
      organizationViewPreferences {
        id type viewType
        preferences { layout projectLayout issueGrouping projectGrouping viewOrdering projectViewOrdering }
      }
      createdAt updatedAt
    }
  }
`

const CREATE_VIEW_MUTATION = `
  mutation CreateCustomView($input: CustomViewCreateInput!) {
    customViewCreate(input: $input) {
      success
      customView { id name description icon color shared filterData projectFilterData initiativeFilterData feedItemFilterData }
    }
  }
`

const UPDATE_VIEW_MUTATION = `
  mutation UpdateCustomView($id: String!, $input: CustomViewUpdateInput!) {
    customViewUpdate(id: $id, input: $input) {
      success
      customView { id name description icon color shared filterData projectFilterData initiativeFilterData feedItemFilterData }
    }
  }
`

const DELETE_VIEW_MUTATION = `
  mutation DeleteCustomView($id: String!) {
    customViewDelete(id: $id) { success }
  }
`

const SET_VIEW_PREFERENCES_MUTATION = `
  mutation SetViewPreferences($input: ViewPreferencesCreateInput!) {
    viewPreferencesCreate(input: $input) {
      success
      viewPreferences {
        id type viewType
        preferences {
          layout issueGrouping issueSubGrouping viewOrdering viewOrderingDirection
          showCompletedIssues showSubIssues showEmptyGroups
          fieldId fieldStatus fieldPriority fieldAssignee fieldProject fieldDueDate
          fieldLabels fieldMilestone fieldEstimate fieldTimeInCurrentStatus fieldLinkCount
          projectLayout projectGrouping projectViewOrdering showCompletedProjects
          projectFieldStatus projectFieldHealth projectFieldLead projectFieldMembers
          projectFieldStartDate projectFieldTargetDate projectFieldMilestone
        }
      }
    }
  }
`

export const viewTools: ToolDef[] = [
  {
    name: 'list_views',
    description:
      'List saved custom views (filters). Use first <= 50 per page and paginate with after.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        ...PAGINATION_PROPS,
        first: {
          type: 'integer',
          maximum: 50,
          description: 'Number of views to return per page. Max 50.',
        },
      },
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(LIST_VIEWS_QUERY, {
        first: (args.first as number) || 50,
        after: args.after as string | undefined,
      })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'get_view',
    description: 'Get a custom view by ID with its filter configuration.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Custom view UUID (required)' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(GET_VIEW_QUERY, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'create_view',
    description: 'Create a saved custom view (filter). Use filterData for issue views, projectFilterData for project views. Icons accept Linear icon names such as "List" or "Health"; colors use hex.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Optional client-generated custom view UUID' },
        name: { type: 'string', description: 'View name (required)' },
        description: { type: 'string', description: 'View description' },
        icon: { type: 'string', description: 'Linear icon name (e.g. "List", "Inbox", "Health")' },
        color: { type: 'string', description: 'Color hex (e.g. "#5e6ad2")' },
        teamId: { type: 'string', description: 'Scope to team UUID' },
        projectId: { type: 'string', description: 'Scope to project UUID' },
        initiativeId: { type: 'string', description: 'Scope to initiative UUID' },
        ownerId: { type: 'string', description: 'Owner user UUID' },
        shared: { type: 'boolean', description: 'Share with workspace (default: false)' },
        filterData: { type: 'object', description: 'IssueFilter object (e.g. { state: { name: { eq: "In Progress" } }, assignee: { isMe: { eq: true } } })' },
        projectFilterData: { type: 'object', description: 'ProjectFilter object for project views' },
        initiativeFilterData: { type: 'object', description: 'InitiativeFilter object for initiative views' },
        feedItemFilterData: { type: 'object', description: 'FeedItemFilter object for feed/update views' },
      },
      required: ['name'],
    },
    examples: [
      {
        title: 'Personal list view',
        args: {
          workspace: 'personal',
          name: 'MCP Smoke View',
          icon: 'List',
          color: '#5e6ad2',
          shared: false,
          filterData: { state: { type: { neq: 'completed' } } },
        },
      },
      {
        title: 'No project filter',
        args: {
          workspace: 'personal',
          name: 'Inbox without project',
          icon: 'Inbox',
          color: '#26b5ce',
          filterData: { project: { null: true } },
        },
      },
    ],
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, ...input } = args
      const data = await client.query(CREATE_VIEW_MUTATION, { input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'update_view',
    description: 'Update a custom view, including filters and visual metadata. Icons accept Linear icon names; colors use hex.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Custom view UUID (required)' },
        name: { type: 'string', description: 'New name' },
        description: { type: 'string', description: 'New description' },
        icon: { type: 'string', description: 'New Linear icon name (e.g. "List", "Inbox", "Health")' },
        color: { type: 'string', description: 'New color hex (e.g. "#5e6ad2")' },
        teamId: { type: 'string', description: 'Scope to team UUID' },
        projectId: { type: 'string', description: 'Scope to project UUID' },
        initiativeId: { type: 'string', description: 'Scope to initiative UUID' },
        ownerId: { type: 'string', description: 'Owner user UUID' },
        shared: { type: 'boolean', description: 'Share with workspace' },
        filterData: { type: 'object', description: 'New IssueFilter object' },
        projectFilterData: { type: 'object', description: 'New ProjectFilter object' },
        initiativeFilterData: { type: 'object', description: 'New InitiativeFilter object' },
        feedItemFilterData: { type: 'object', description: 'New FeedItemFilter object' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, id, ...input } = args
      const data = await client.query(UPDATE_VIEW_MUTATION, { id, input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'delete_view',
    description: 'Delete a custom view.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Custom view UUID (required)' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(DELETE_VIEW_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'set_view_preferences',
    description: 'Set layout, grouping, ordering, and display fields for a custom view. Issue views use layout/issueGrouping/viewOrdering. Project views use projectLayout/projectGrouping/projectViewOrdering.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        customViewId: { type: 'string', description: 'Custom view UUID (required)' },
        preferences: {
          type: 'object',
          description: `Layout preferences object. Key fields:

ISSUE VIEWS:
- layout: "list" or "board"
- issueGrouping: "status", "priority", "assignee", "label", "project", "cycle", "noGrouping"
- issueSubGrouping: same options as grouping, or "noGrouping"
- viewOrdering: "priority", "createdAt", "updatedAt", "manual"
- viewOrderingDirection: "ascending" or "descending"
- showCompletedIssues: "showAll", "showLast30Days", "showNone"
- showSubIssues: boolean
- showEmptyGroups: boolean
- fieldStatus, fieldPriority, fieldAssignee, fieldProject, fieldDueDate, fieldLabels, fieldMilestone, fieldEstimate, fieldTimeInCurrentStatus, fieldLinkCount: boolean (toggle columns)

PROJECT VIEWS:
- projectLayout: "list", "board", "timeline"
- projectGrouping: "status", "lead", "noGrouping"
- projectViewOrdering: "manual", "createdAt", "updatedAt"
- showCompletedProjects: "showAll", "showNone"
- projectFieldStatus, projectFieldHealth, projectFieldLead, projectFieldMembers, projectFieldStartDate, projectFieldTargetDate, projectFieldMilestone: boolean`,
        },
        type: { type: 'string', description: 'Preference scope: "organization" (shared) or "user" (personal). Default: "organization"' },
      },
      required: ['customViewId', 'preferences'],
    },
    examples: [
      {
        title: 'Personal list defaults',
        description: 'List layout, no grouping, hide assignee, show status/priority/project/due date.',
        args: {
          workspace: 'personal',
          customViewId: 'custom-view-uuid',
          type: 'user',
          preferences: {
            layout: 'list',
            issueGrouping: 'noGrouping',
            viewOrdering: 'priority',
            viewOrderingDirection: 'ascending',
            fieldAssignee: false,
            fieldStatus: true,
            fieldPriority: true,
            fieldProject: true,
            fieldDueDate: true,
            fieldLabels: true,
            fieldMilestone: true,
          },
        },
      },
      {
        title: 'Grouped by status',
        args: {
          workspace: 'personal',
          customViewId: 'custom-view-uuid',
          type: 'user',
          preferences: {
            layout: 'list',
            issueGrouping: 'status',
            showEmptyGroups: false,
            fieldAssignee: false,
            fieldStatus: true,
            fieldPriority: true,
          },
        },
      },
    ],
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(SET_VIEW_PREFERENCES_MUTATION, {
        input: {
          customViewId: args.customViewId,
          type: (args.type as string) || 'organization',
          viewType: 'customView',
          preferences: args.preferences,
        },
      })
      return JSON.stringify(data, null, 2)
    },
  },
]
