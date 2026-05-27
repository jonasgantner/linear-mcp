import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP, PAGINATION_PROPS } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'

const VIEW_PREFERENCE_VALUE_FIELDS = `
  layout viewOrdering viewOrderingDirection
  issueGrouping issueSubGrouping issueNesting
  showCompletedIssues showParents showSubIssues showTriageIssues showEmptyGroups
  showEmptyGroupsBoard showEmptyGroupsList showEmptySubGroups
  fieldId fieldStatus fieldPriority fieldDateCreated fieldDateUpdated fieldAssignee
  fieldEstimate fieldDueDate fieldLinkCount fieldLabels fieldProject fieldCycle
  fieldMilestone fieldTimeInCurrentStatus
  projectLayout projectViewOrdering projectGrouping projectSubGrouping groupOrderingMode
  showCompletedProjects showSubTeamProjects showSubInitiativeProjects
  projectShowEmptyGroups projectShowEmptyGroupsList projectShowEmptyGroupsTimeline projectShowEmptyGroupsBoard
  projectFieldStatus projectFieldPriority projectFieldLead projectFieldHealth projectFieldMembers
  projectFieldStartDate projectFieldTargetDate projectFieldTeams projectFieldInitiatives
  projectFieldMilestone projectFieldDescription projectFieldLabels
`

const VIEW_PREFERENCE_FIELDS = `
  id type viewType
  preferences { ${VIEW_PREFERENCE_VALUE_FIELDS} }
`

const FACET_READBACK_FIELDS = `
  id sortOrder archivedAt createdAt updatedAt
  sourceOrganization { id name urlKey }
  sourceTeam { id name key }
  sourceProject { id name slugId url }
  sourceInitiative { id name slugId url }
  sourceFeedUser { id name }
  sourcePage
  targetCustomView { id name modelName }
`

const CUSTOM_VIEW_READBACK_FIELDS = `
  id name description icon color shared modelName
  owner { id name }
  team { id name key }
  facet { ${FACET_READBACK_FIELDS} }
  projects(first: 50) { nodes { id name } }
  initiatives(first: 50) { nodes { id name } }
  filterData
  projectFilterData
  initiativeFilterData
  feedItemFilterData
  userViewPreferences { ${VIEW_PREFERENCE_FIELDS} }
  organizationViewPreferences { ${VIEW_PREFERENCE_FIELDS} }
  viewPreferencesValues { ${VIEW_PREFERENCE_VALUE_FIELDS} }
  createdAt updatedAt
`

const LIST_VIEWS_QUERY = `
  query ListCustomViews($first: Int, $after: String) {
    customViews(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        ${CUSTOM_VIEW_READBACK_FIELDS}
      }
    }
  }
`

const LIST_PROJECT_VIEWS_QUERY = `
  query ListProjectScopedCustomViews($id: String!) {
    project(id: $id) {
      id name url
      facets {
        ${FACET_READBACK_FIELDS}
        targetCustomView {
          ${CUSTOM_VIEW_READBACK_FIELDS}
        }
      }
    }
  }
`

const LIST_INITIATIVE_VIEWS_QUERY = `
  query ListInitiativeScopedCustomViews($id: String!) {
    initiative(id: $id) {
      id name url
      facets {
        ${FACET_READBACK_FIELDS}
        targetCustomView {
          ${CUSTOM_VIEW_READBACK_FIELDS}
        }
      }
    }
  }
`

const GET_VIEW_QUERY = `
  query GetCustomView($id: String!) {
    customView(id: $id) {
      ${CUSTOM_VIEW_READBACK_FIELDS}
    }
  }
`

const CREATE_VIEW_MUTATION = `
  mutation CreateCustomView($input: CustomViewCreateInput!) {
    customViewCreate(input: $input) {
      success
      customView {
        ${CUSTOM_VIEW_READBACK_FIELDS}
      }
    }
  }
`

const UPDATE_VIEW_MUTATION = `
  mutation UpdateCustomView($id: String!, $input: CustomViewUpdateInput!) {
    customViewUpdate(id: $id, input: $input) {
      success
      customView {
        ${CUSTOM_VIEW_READBACK_FIELDS}
      }
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
        ${VIEW_PREFERENCE_FIELDS}
      }
    }
  }
`

const SCHEMA_TYPE_FIELDS_QUERY = `
  query SchemaTypeFields($name: String!) {
    __type(name: $name) {
      kind
      name
      fields { name }
      inputFields { name }
    }
  }
`

const VIEW_SCHEMA_EXPECTED_FIELDS: Record<string, string[]> = {
  CustomViewCreateInput: [
    'id',
    'name',
    'description',
    'icon',
    'color',
    'teamId',
    'projectId',
    'initiativeId',
    'ownerId',
    'filterData',
    'projectFilterData',
    'initiativeFilterData',
    'feedItemFilterData',
    'shared',
  ],
  CustomViewUpdateInput: [
    'name',
    'description',
    'icon',
    'color',
    'teamId',
    'projectId',
    'initiativeId',
    'ownerId',
    'filterData',
    'projectFilterData',
    'initiativeFilterData',
    'feedItemFilterData',
    'shared',
  ],
  IssueFilter: [
    'id',
    'state',
    'team',
    'project',
    'labels',
    'assignee',
    'priority',
    'dueDate',
    'parent',
    'subscribers',
    'projectMilestone',
    'and',
    'or',
  ],
  ProjectFilter: [
    'id',
    'name',
    'state',
    'status',
    'priority',
    'labels',
    'lead',
    'members',
    'initiatives',
    'accessibleTeams',
    'targetDate',
    'startDate',
    'health',
    'and',
    'or',
  ],
  InitiativeFilter: [
    'id',
    'name',
    'status',
    'teams',
    'owner',
    'targetDate',
    'and',
    'or',
  ],
  FeedItemFilter: [
    'id',
    'author',
    'updateType',
    'updateHealth',
    'projectUpdate',
    'relatedInitiatives',
    'relatedTeams',
    'and',
    'or',
  ],
  CustomView: [
    'modelName',
    'facet',
    'team',
    'projects',
    'initiatives',
    'viewPreferencesValues',
  ],
  Facet: [
    'sortOrder',
    'sourceOrganization',
    'sourceTeam',
    'sourceProject',
    'sourceInitiative',
    'sourceFeedUser',
    'sourcePage',
    'targetCustomView',
  ],
  Project: [
    'facets',
  ],
  Initiative: [
    'facets',
  ],
}

const ISSUE_GROUPING_ALIASES: Record<string, string> = {
  noGrouping: 'none',
  status: 'workflowState',
}

const PROJECT_GROUPING_ALIASES: Record<string, string> = {
  noGrouping: 'none',
}

const ORDERING_ALIASES: Record<string, string> = {
  createdAt: 'dateCreated',
  updatedAt: 'dateUpdated',
  status: 'workflowState',
}

const PROJECT_ORDERING_ALIASES: Record<string, string> = {
  createdAt: 'dateCreated',
  updatedAt: 'dateUpdated',
}

const DIRECTION_ALIASES: Record<string, string> = {
  ascending: 'asc',
  descending: 'desc',
}

const VISIBILITY_ALIASES: Record<string, string> = {
  showAll: 'all',
  showNone: 'none',
}

function normalizeValue(value: unknown, aliases: Record<string, string>): unknown {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(aliases, value)
    ? aliases[value]
    : value
}

function normalizeViewPreferences(preferences: unknown): unknown {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return preferences
  const normalized = { ...(preferences as Record<string, unknown>) }

  normalized.issueGrouping = normalizeValue(normalized.issueGrouping, ISSUE_GROUPING_ALIASES)
  normalized.issueSubGrouping = normalizeValue(normalized.issueSubGrouping, ISSUE_GROUPING_ALIASES)
  normalized.projectGrouping = normalizeValue(normalized.projectGrouping, PROJECT_GROUPING_ALIASES)
  normalized.projectSubGrouping = normalizeValue(normalized.projectSubGrouping, PROJECT_GROUPING_ALIASES)
  normalized.viewOrdering = normalizeValue(normalized.viewOrdering, ORDERING_ALIASES)
  normalized.projectViewOrdering = normalizeValue(normalized.projectViewOrdering, PROJECT_ORDERING_ALIASES)
  normalized.viewOrderingDirection = normalizeValue(normalized.viewOrderingDirection, DIRECTION_ALIASES)
  normalized.showCompletedIssues = normalizeValue(normalized.showCompletedIssues, VISIBILITY_ALIASES)
  normalized.showCompletedProjects = normalizeValue(normalized.showCompletedProjects, VISIBILITY_ALIASES)

  return normalized
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stateTypeEqValue(value: unknown): string | null {
  if (!isRecord(value)) return null
  const state = value.state
  if (!isRecord(state)) return null
  const type = state.type
  if (!isRecord(type)) return null
  return typeof type.eq === 'string' ? type.eq : null
}

function isEmptyFilter(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0
  return isRecord(value) && Object.keys(value).length === 0
}

function withoutTeamFilters(filter: unknown): unknown {
  function strip(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map(item => strip(item)).filter(item => item !== null && !isEmptyFilter(item))
    }
    if (!isRecord(value)) return value

    const result: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      if (key === 'team') continue
      const stripped = strip(child)
      if (stripped !== null && !isEmptyFilter(stripped)) {
        result[key] = stripped
      }
    }

    const keys = Object.keys(result)
    if (keys.length === 0) return null
    if (keys.length === 1 && Array.isArray(result.and)) {
      const items = result.and as unknown[]
      if (items.length === 0) return null
      if (items.length === 1) return items[0]
    }
    return result
  }

  return strip(filter) ?? {}
}

function withoutProjectStatusFilters(filter: unknown): unknown {
  function strip(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map(item => strip(item)).filter(item => item !== null && !isEmptyFilter(item))
    }
    if (!isRecord(value)) return value

    const result: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      if (key === 'status') continue
      const stripped = strip(child)
      if (stripped !== null && !isEmptyFilter(stripped)) {
        result[key] = stripped
      }
    }

    const keys = Object.keys(result)
    if (keys.length === 0) return null
    if (keys.length === 1 && Array.isArray(result.and)) {
      const items = result.and as unknown[]
      if (items.length === 0) return null
      if (items.length === 1) return items[0]
    }
    return result
  }

  return strip(filter) ?? {}
}

function normalizeCustomViewFilter(filter: unknown): unknown {
  if (Array.isArray(filter)) return filter.map(item => normalizeCustomViewFilter(item))
  if (!isRecord(filter)) return filter

  if (Array.isArray(filter.or) && filter.or.length > 0) {
    const stateTypes = filter.or.map(item => stateTypeEqValue(item))
    if (stateTypes.every(Boolean)) {
      return { state: { type: { in: stateTypes } } }
    }
  }

  const normalized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(filter)) {
    normalized[key] = normalizeCustomViewFilter(value)
  }

  const state = normalized.state
  if (isRecord(state) && isRecord(state.type) && typeof state.type.eq === 'string') {
    const { eq, ...rest } = state.type
    normalized.state = { ...state, type: { ...rest, in: [eq] } }
  }

  const project = normalized.project
  if (isRecord(project) && project.null === true) {
    normalized.project = { or: [{ id: { in: [] } }, { null: true }] }
  }

  return normalized
}

function normalizeViewInput(args: Record<string, unknown>): Record<string, unknown> {
  const input = { ...args }
  if (Object.prototype.hasOwnProperty.call(input, 'filterData')) {
    input.filterData = normalizeCustomViewFilter(withoutTeamFilters(input.filterData))
  }
  if (Object.prototype.hasOwnProperty.call(input, 'projectFilterData')) {
    input.projectFilterData = normalizeCustomViewFilter(withoutProjectStatusFilters(input.projectFilterData))
  }
  return input
}

async function checkViewSchemaDrift(client: LinearClient): Promise<Record<string, unknown>> {
  const checked: Record<string, { expected: string[]; actual: string[]; missing: string[] }> = {}
  const missingMessages: string[] = []

  for (const [typeName, expected] of Object.entries(VIEW_SCHEMA_EXPECTED_FIELDS)) {
    const data = await client.query<{ __type: { fields?: Array<{ name: string }> | null; inputFields?: Array<{ name: string }> | null } | null }>(
      SCHEMA_TYPE_FIELDS_QUERY,
      { name: typeName },
    )
    const actual = (data.__type?.inputFields ?? data.__type?.fields ?? []).map(field => field.name).sort()
    const missing = expected.filter(field => !actual.includes(field))
    checked[typeName] = { expected, actual, missing }
    for (const field of missing) missingMessages.push(`${typeName}.${field}`)
  }

  if (missingMessages.length > 0) {
    throw new Error(`Linear view schema drift: missing required field(s): ${missingMessages.join(', ')}`)
  }

  return {
    ok: true,
    checkedTypes: Object.keys(VIEW_SCHEMA_EXPECTED_FIELDS),
    checked,
  }
}

function customViewsFromFacets(parentKey: 'project' | 'initiative', parent: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const facets = Array.isArray(parent?.facets) ? parent.facets as Array<Record<string, unknown>> : []
  const nodes = facets
    .map(facet => {
      const target = facet.targetCustomView
      if (!target || typeof target !== 'object' || Array.isArray(target)) return null
      return {
        ...(target as Record<string, unknown>),
        facet,
      }
    })
    .filter(Boolean)

  return {
    [parentKey]: parent
      ? Object.fromEntries(Object.entries(parent).filter(([key]) => key !== 'facets'))
      : null,
    customViews: {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes,
    },
  }
}

export const viewTools: ToolDef[] = [
  {
    name: 'list_views',
    description:
      'List saved custom views (filters). By default this returns workspace/team-level views from Linear customViews, which explicitly excludes project/initiative tab views. Pass projectId or initiativeId to list UI tab views attached via facets. Use first <= 50 per page and paginate with after for the default customViews listing.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        ...PAGINATION_PROPS,
        projectId: {
          type: 'string',
          description: 'Project UUID. When set, list custom view tabs attached to that project via facets.',
        },
        initiativeId: {
          type: 'string',
          description: 'Initiative UUID. When set, list custom view tabs attached to that initiative via facets.',
        },
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
      if (args.projectId && args.initiativeId) {
        throw new Error('Pass either projectId or initiativeId, not both')
      }
      if (args.projectId) {
        const data = await client.query<{ project?: Record<string, unknown> | null }>(
          LIST_PROJECT_VIEWS_QUERY,
          { id: args.projectId },
        )
        return JSON.stringify(customViewsFromFacets('project', data.project), null, 2)
      }
      if (args.initiativeId) {
        const data = await client.query<{ initiative?: Record<string, unknown> | null }>(
          LIST_INITIATIVE_VIEWS_QUERY,
          { id: args.initiativeId },
        )
        return JSON.stringify(customViewsFromFacets('initiative', data.initiative), null, 2)
      }
      const data = await client.query(LIST_VIEWS_QUERY, {
        first: (args.first as number) || 50,
        after: args.after as string | undefined,
      })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'get_view',
    description: 'Get a custom view by ID with its filter configuration, effective preferences, model type, and facet readback when it is attached as a project/initiative/team/workspace tab.',
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
    name: 'check_view_schema_drift',
    description: 'Check the live Linear GraphQL schema for the custom-view input/filter fields used by MCP schemas, examples, and smoke fixtures. Fails if a required field disappears.',
    sideEffect: 'read',
    inputSchema: {
      type: 'object',
      properties: { ...WORKSPACE_PROP },
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await checkViewSchemaDrift(client)
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'create_view',
    description: 'Create a saved custom view (filter). Returns full custom-view readback including owner/team/facet, model type, filters, preferences, and timestamps. Omit teamId for workspace-level issue views; pass teamId only when you intentionally need a team-scoped issue view. Linear public GraphQL currently accepts projectId/initiativeId but does not create the UI project/initiative tab facet; use list_views with projectId/initiativeId or get_view.facet to read UI-created scoped tabs. Do not put team in filterData because Linear renders that as a non-editable raw filter; this tool strips team filters from filterData. Use filterData for editable issue filters and projectFilterData for project views. For GUI-friendly project views, this tool strips project status filters from projectFilterData; use projectGrouping/display preferences instead. The tool normalizes common unsafe shapes like state.type.eq. Icons accept Linear icon names such as "Health", "Rocket", or "Briefcase"; colors use hex.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Optional client-generated custom view UUID' },
        name: { type: 'string', description: 'View name (required)' },
        description: { type: 'string', description: 'View description' },
        icon: { type: 'string', description: 'Linear icon name (e.g. "Health", "Rocket", "Briefcase")' },
        color: { type: 'string', description: 'Color hex (e.g. "#5e6ad2")' },
        teamId: { type: 'string', description: 'Optional team UUID for intentionally team-scoped issue views. Omit for workspace-level views.' },
        projectId: { type: 'string', description: 'Project UUID accepted by Linear CustomViewCreateInput, but currently does not create the UI project tab facet on public GraphQL readback.' },
        initiativeId: { type: 'string', description: 'Initiative UUID accepted by Linear CustomViewCreateInput, but currently does not create the UI initiative tab facet on public GraphQL readback.' },
        ownerId: { type: 'string', description: 'Owner user UUID' },
        shared: { type: 'boolean', description: 'Share with workspace (default: false)' },
        filterData: { type: 'object', description: 'Linear custom view issue filter JSON for filters users should edit in the GUI. Prefer { state: { type: { in: ["unstarted", "started"] } } }. Do not include team here; omit team scope for workspace-level views or use top-level teamId only when intentional.' },
        projectFilterData: { type: 'object', description: 'Linear custom view project filter JSON. For GUI-friendly project views, omit this or pass {} and use projectGrouping/display preferences instead. Status filters are stripped because they can render as one-status/type filters that are hard to edit in Linear.' },
        initiativeFilterData: { type: 'object', description: 'InitiativeFilter object for initiative views' },
        feedItemFilterData: { type: 'object', description: 'FeedItemFilter object for feed/update views' },
      },
      required: ['name'],
    },
    examples: [
      {
        title: 'Workspace active issues',
        description: 'Workspace-level issue view. GUI-safe state type filter; no team filter in filterData.',
        args: {
          workspace: 'personal',
          name: 'Active issues',
          icon: 'Health',
          color: '#5e6ad2',
          shared: false,
          filterData: { state: { type: { in: ['triage', 'backlog', 'unstarted', 'started'] } } },
        },
      },
      {
        title: 'Team-scoped issues',
        description: 'Use top-level teamId only when the view should intentionally live under one team.',
        args: {
          workspace: 'personal',
          name: 'Team active issues',
          icon: 'Health',
          color: '#5e6ad2',
          teamId: 'team-uuid',
          filterData: { state: { type: { in: ['unstarted', 'started'] } } },
        },
      },
      {
        title: 'No project filter',
        description: 'GUI-safe replacement for project.null=true.',
        args: {
          workspace: 'personal',
          name: 'Inbox without project',
          icon: 'Health',
          color: '#26b5ce',
          filterData: { project: { or: [{ id: { in: [] } }, { null: true }] } },
        },
      },
      {
        title: 'Label filter',
        description: 'Filter issues by labels while staying editable in the Linear filter GUI.',
        args: {
          workspace: 'personal',
          name: 'Label queue',
          icon: 'Health',
          color: '#4cb782',
          filterData: { labels: { id: { in: ['label-uuid'] } } },
        },
      },
      {
        title: 'Project display view',
        description: 'For project views, prefer empty projectFilterData plus project display preferences.',
        args: {
          workspace: 'test',
          name: 'Projects by Status',
          icon: 'Briefcase',
          color: '#f2c94c',
          shared: false,
          projectFilterData: {},
        },
      },
      {
        title: 'Initiatives by team',
        description: 'Initiative view filter using the workspace team collection relation.',
        args: {
          workspace: 'personal',
          name: 'Team initiatives',
          icon: 'Health',
          color: '#26b5ce',
          initiativeFilterData: { teams: { id: { in: ['team-uuid'] } } },
        },
      },
      {
        title: 'Known-bad team filter',
        description: 'This executes but renders as a non-editable raw Team filter in Linear; the MCP strips team from filterData.',
        args: {
          workspace: 'personal',
          name: 'Bad team filter example',
          filterData: { team: { id: { eq: 'team-uuid' } } },
        },
      },
      {
        title: 'Known-bad project status filter',
        description: 'This can render as a one-status/type project filter that is hard to edit; the MCP strips projectFilterData.status.',
        args: {
          workspace: 'test',
          name: 'Bad project status filter example',
          projectFilterData: { status: { id: { in: ['project-status-uuid'] } } },
        },
      },
    ],
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, ...rawInput } = args
      const input = normalizeViewInput(rawInput)
      const data = await client.query(CREATE_VIEW_MUTATION, { input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'update_view',
    description: 'Update a custom view, including filters and visual metadata. Returns full custom-view readback including owner/team/facet, model type, filters, preferences, and timestamps. Linear public GraphQL currently accepts projectId/initiativeId but does not create or move the UI project/initiative tab facet; check get_view.facet for real scoped-tab attachment. Icons accept Linear icon names; colors use hex.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Custom view UUID (required)' },
        name: { type: 'string', description: 'New name' },
        description: { type: 'string', description: 'New description' },
        icon: { type: 'string', description: 'New Linear icon name (e.g. "Health", "Rocket", "Briefcase")' },
        color: { type: 'string', description: 'New color hex (e.g. "#5e6ad2")' },
        teamId: { type: 'string', description: 'Optional team UUID for intentionally team-scoped issue views. Omit for workspace-level views.' },
        projectId: { type: 'string', description: 'Project UUID accepted by Linear CustomViewUpdateInput, but currently does not create or move the UI project tab facet on public GraphQL readback.' },
        initiativeId: { type: 'string', description: 'Initiative UUID accepted by Linear CustomViewUpdateInput, but currently does not create or move the UI initiative tab facet on public GraphQL readback.' },
        ownerId: { type: 'string', description: 'Owner user UUID' },
        shared: { type: 'boolean', description: 'Share with workspace' },
        filterData: { type: 'object', description: 'New Linear custom view issue filter JSON for filters users should edit in the GUI. Do not include team here; omit team scope for workspace-level views or use top-level teamId only when intentional.' },
        projectFilterData: { type: 'object', description: 'New Linear custom view project filter JSON. For GUI-friendly project views, omit this or pass {}; status filters are stripped because they can render as one-status/type filters that are hard to edit in Linear.' },
        initiativeFilterData: { type: 'object', description: 'New InitiativeFilter object' },
        feedItemFilterData: { type: 'object', description: 'New FeedItemFilter object' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, id, ...rawInput } = args
      const input = normalizeViewInput(rawInput)
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
    description: 'Set layout, grouping, ordering, and display fields for a custom view. The tool normalizes common aliases (for example status -> workflowState, noGrouping -> none, createdAt -> dateCreated) so the Linear UI does not show blank dropdown states.',
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
- issueGrouping: "workflowState", "priority", "assignee", "label", "project", "cycle", "none" (aliases: "status", "noGrouping")
- issueSubGrouping: same options as grouping, or "none"
- issueNesting: "none" or "showAll"
- viewOrdering: "priority", "workflowState", "dueDate", "dateCreated", "dateUpdated", "manual" (known-good GUI values include "priority", "workflowState", "dueDate", and "dateCreated"; aliases: "createdAt", "updatedAt")
- viewOrderingDirection: "asc" or "desc" (aliases: "ascending", "descending")
- showCompletedIssues: "all" or "none"
- showSubIssues: boolean
- showTriageIssues: boolean
- showEmptyGroups: boolean
- fieldStatus, fieldPriority, fieldAssignee, fieldProject, fieldDueDate, fieldLabels, fieldMilestone, fieldEstimate, fieldTimeInCurrentStatus, fieldLinkCount, fieldDateCreated, fieldDateUpdated: boolean (toggle columns)

PROJECT VIEWS:
- projectLayout: "list" or "board" (avoid "timeline" in the free test workspace; it can render broken)
- projectGrouping: "status", "lead", "initiative", "none" (alias: "noGrouping")
- projectViewOrdering: "priority" or "status" (known-good GUI values)
- showCompletedProjects: "all" or "none"
- projectFieldStatus, projectFieldPriority, projectFieldHealth, projectFieldLead, projectFieldMembers, projectFieldStartDate, projectFieldTargetDate, projectFieldTeams, projectFieldInitiatives, projectFieldMilestone, projectFieldLabels: boolean`,
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
            issueGrouping: 'none',
            viewOrdering: 'priority',
            viewOrderingDirection: 'asc',
            showCompletedIssues: 'none',
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
        description: 'GUI-safe internal grouping value for the Linear Status dropdown.',
        args: {
          workspace: 'personal',
          customViewId: 'custom-view-uuid',
          type: 'user',
          preferences: {
            layout: 'list',
            issueGrouping: 'workflowState',
            issueSubGrouping: 'none',
            showEmptyGroups: false,
            fieldAssignee: false,
            fieldStatus: true,
            fieldPriority: true,
          },
        },
      },
      {
        title: 'Board by assignee',
        description: 'Board layout with assignee grouping and stable visible issue fields.',
        args: {
          workspace: 'personal',
          customViewId: 'custom-view-uuid',
          type: 'user',
          preferences: {
            layout: 'board',
            issueGrouping: 'assignee',
            issueSubGrouping: 'none',
            viewOrdering: 'priority',
            viewOrderingDirection: 'asc',
            showCompletedIssues: 'none',
            fieldStatus: true,
            fieldPriority: true,
            fieldLabels: true,
            fieldProject: true,
          },
        },
      },
      {
        title: 'Project list',
        args: {
          workspace: 'test',
          customViewId: 'custom-view-uuid',
          type: 'user',
          preferences: {
            projectLayout: 'list',
            projectGrouping: 'status',
            projectViewOrdering: 'priority',
            showCompletedProjects: 'none',
            projectFieldStatus: true,
            projectFieldHealth: true,
            projectFieldLead: true,
            projectFieldStartDate: true,
            projectFieldTargetDate: true,
          },
        },
      },
      {
        title: 'Project board by lead',
        description: 'Project display preferences without raw project status filters.',
        args: {
          workspace: 'test',
          customViewId: 'custom-view-uuid',
          type: 'user',
          preferences: {
            projectLayout: 'board',
            projectGrouping: 'lead',
            projectViewOrdering: 'priority',
            showCompletedProjects: 'none',
            projectFieldStatus: true,
            projectFieldPriority: true,
            projectFieldLead: true,
            projectFieldHealth: true,
            projectFieldTeams: true,
            projectFieldInitiatives: true,
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
          preferences: normalizeViewPreferences(args.preferences),
        },
      })
      return JSON.stringify(data, null, 2)
    },
  },
]
