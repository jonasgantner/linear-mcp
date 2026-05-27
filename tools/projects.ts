import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP, PAGINATION_PROPS } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'

const PROJECT_STATUS_FIELDS = `
  id name color description position type indefinite archivedAt
`

const PROJECT_UPDATE_FIELDS = `
  id body health url archivedAt createdAt updatedAt user { id name }
`

const PROJECT_RELATION_FIELDS = `
  id type anchorType relatedAnchorType archivedAt createdAt updatedAt
  project { id name }
  projectMilestone { id name }
  relatedProject { id name }
  relatedProjectMilestone { id name }
  user { id name }
`

const SEARCH_PROJECTS_QUERY = `
  query SearchProjects($filter: ProjectFilter, $first: Int, $after: String) {
    projects(filter: $filter, first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id name description url state archivedAt startDate targetDate progress
        status { ${PROJECT_STATUS_FIELDS} }
        lead { id name }
        teams { nodes { id name key } }
        members { nodes { id name } }
        labels { nodes { id name color description isGroup } }
        initiatives { nodes { id name status color icon targetDate } }
      }
    }
  }
`

const GET_PROJECT_QUERY = `
  query GetProject($id: String!) {
    project(id: $id) {
      id name description content contentState url state archivedAt icon color priority startDate targetDate progress
      documentContent { id }
      status { ${PROJECT_STATUS_FIELDS} }
      lead { id name }
      teams { nodes { id name key } }
      members { nodes { id name } }
      labels { nodes { id name color description isGroup } }
      initiatives { nodes { id name description status color icon targetDate owner { id name } } }
      initiativeToProjects { nodes { id sortOrder initiative { id name status } } }
      issues { nodes { id identifier title state { name } priority assignee { name } } }
      projectMilestones { nodes { id name description targetDate sortOrder } }
      projectUpdates { nodes { ${PROJECT_UPDATE_FIELDS} } }
      relations { nodes { ${PROJECT_RELATION_FIELDS} } }
      comments {
        nodes {
          id body quotedText url
          issueId projectId initiativeId documentContentId projectUpdateId initiativeUpdateId parentId
          user { name }
          createdAt updatedAt resolvedAt
        }
      }
    }
  }
`

const LIST_PROJECT_STATUSES_QUERY = `
  query ListProjectStatuses($first: Int, $after: String, $includeArchived: Boolean) {
    projectStatuses(first: $first, after: $after, includeArchived: $includeArchived) {
      pageInfo { hasNextPage endCursor }
      nodes { ${PROJECT_STATUS_FIELDS} }
    }
  }
`

const GET_PROJECT_STATUS_QUERY = `
  query GetProjectStatus($id: String!) {
    projectStatus(id: $id) { ${PROJECT_STATUS_FIELDS} }
  }
`

const CREATE_PROJECT_MUTATION = `
  mutation CreateProject($input: ProjectCreateInput!) {
    projectCreate(input: $input) {
      success
      project { id name url state status { ${PROJECT_STATUS_FIELDS} } }
    }
  }
`

const UPDATE_PROJECT_MUTATION = `
  mutation UpdateProject($id: String!, $input: ProjectUpdateInput!) {
    projectUpdate(id: $id, input: $input) {
      success
      project { id name url state icon color priority status { ${PROJECT_STATUS_FIELDS} } }
    }
  }
`

const ARCHIVE_PROJECT_MUTATION = `
  mutation ArchiveProject($id: String!) {
    projectDelete(id: $id) { success }
  }
`

const UNARCHIVE_PROJECT_MUTATION = `
  mutation UnarchiveProject($id: String!) {
    projectUnarchive(id: $id) {
      success
      entity { id name archivedAt url state status { ${PROJECT_STATUS_FIELDS} } }
    }
  }
`

const CREATE_PROJECT_STATUS_MUTATION = `
  mutation CreateProjectStatus($input: ProjectStatusCreateInput!) {
    projectStatusCreate(input: $input) {
      success
      status { ${PROJECT_STATUS_FIELDS} }
    }
  }
`

const UPDATE_PROJECT_STATUS_MUTATION = `
  mutation UpdateProjectStatus($id: String!, $input: ProjectStatusUpdateInput!) {
    projectStatusUpdate(id: $id, input: $input) {
      success
      status { ${PROJECT_STATUS_FIELDS} }
    }
  }
`

const ARCHIVE_PROJECT_STATUS_MUTATION = `
  mutation ArchiveProjectStatus($id: String!) {
    projectStatusArchive(id: $id) {
      success
      entity { ${PROJECT_STATUS_FIELDS} }
    }
  }
`

const UNARCHIVE_PROJECT_STATUS_MUTATION = `
  mutation UnarchiveProjectStatus($id: String!) {
    projectStatusUnarchive(id: $id) {
      success
      entity { ${PROJECT_STATUS_FIELDS} }
    }
  }
`

const REASSIGN_PROJECT_STATUS_MUTATION = `
  mutation ReassignProjectStatus($originalProjectStatusId: String!, $newProjectStatusId: String!) {
    projectReassignStatus(
      originalProjectStatusId: $originalProjectStatusId,
      newProjectStatusId: $newProjectStatusId
    ) {
      success
    }
  }
`

const CREATE_PROJECT_UPDATE_MUTATION = `
  mutation CreateProjectUpdate($input: ProjectUpdateCreateInput!) {
    projectUpdateCreate(input: $input) {
      success
      projectUpdate { ${PROJECT_UPDATE_FIELDS} }
    }
  }
`

const UPDATE_PROJECT_UPDATE_MUTATION = `
  mutation UpdateProjectUpdate($id: String!, $input: ProjectUpdateUpdateInput!) {
    projectUpdateUpdate(id: $id, input: $input) {
      success
      projectUpdate { ${PROJECT_UPDATE_FIELDS} }
    }
  }
`

const ARCHIVE_PROJECT_UPDATE_MUTATION = `
  mutation ArchiveProjectUpdate($id: String!) {
    projectUpdateArchive(id: $id) {
      success
      entity { ${PROJECT_UPDATE_FIELDS} }
    }
  }
`

const UNARCHIVE_PROJECT_UPDATE_MUTATION = `
  mutation UnarchiveProjectUpdate($id: String!) {
    projectUpdateUnarchive(id: $id) {
      success
      entity { ${PROJECT_UPDATE_FIELDS} }
    }
  }
`

const CREATE_PROJECT_RELATION_MUTATION = `
  mutation CreateProjectRelation($input: ProjectRelationCreateInput!) {
    projectRelationCreate(input: $input) {
      success
      projectRelation { ${PROJECT_RELATION_FIELDS} }
    }
  }
`

const UPDATE_PROJECT_RELATION_MUTATION = `
  mutation UpdateProjectRelation($id: String!, $input: ProjectRelationUpdateInput!) {
    projectRelationUpdate(id: $id, input: $input) {
      success
      projectRelation { ${PROJECT_RELATION_FIELDS} }
    }
  }
`

const DELETE_PROJECT_RELATION_MUTATION = `
  mutation DeleteProjectRelation($id: String!) {
    projectRelationDelete(id: $id) { success }
  }
`

const ADD_PROJECT_LABEL_MUTATION = `
  mutation AddProjectLabel($id: String!, $labelId: String!) {
    projectAddLabel(id: $id, labelId: $labelId) { success }
  }
`

const REMOVE_PROJECT_LABEL_MUTATION = `
  mutation RemoveProjectLabel($id: String!, $labelId: String!) {
    projectRemoveLabel(id: $id, labelId: $labelId) { success }
  }
`

const CREATE_PROJECT_MILESTONE_MUTATION = `
  mutation CreateProjectMilestone($input: ProjectMilestoneCreateInput!) {
    projectMilestoneCreate(input: $input) {
      success
      projectMilestone { id name description targetDate sortOrder }
    }
  }
`

const UPDATE_PROJECT_MILESTONE_MUTATION = `
  mutation UpdateProjectMilestone($id: String!, $input: ProjectMilestoneUpdateInput!) {
    projectMilestoneUpdate(id: $id, input: $input) {
      success
      projectMilestone { id name description targetDate }
    }
  }
`

const DELETE_PROJECT_MILESTONE_MUTATION = `
  mutation DeleteProjectMilestone($id: String!) {
    projectMilestoneDelete(id: $id) { success }
  }
`

type ProjectStatusNode = {
  id: string
  name: string
  type: string
}

async function resolveProjectStatusId(
  client: LinearClient,
  status: unknown,
): Promise<string | undefined> {
  if (typeof status !== 'string' || status.trim() === '') return undefined
  const normalized = status.trim().toLowerCase()
  const data = await client.query<{
    projectStatuses: { nodes: ProjectStatusNode[] }
  }>(LIST_PROJECT_STATUSES_QUERY, { first: 250, includeArchived: false })
  const match = data.projectStatuses.nodes.find(
    s => s.type.toLowerCase() === normalized || s.name.toLowerCase() === normalized,
  )
  if (!match) {
    const available = data.projectStatuses.nodes.map(s => `${s.name} (${s.type})`).join(', ')
    throw new Error(`No active project status matched "${status}". Available: ${available}`)
  }
  return match.id
}

async function buildProjectInput(
  client: LinearClient,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { workspace: _, state, ...input } = args
  if (!input.statusId && state) {
    input.statusId = await resolveProjectStatusId(client, state)
  }
  return input
}

export const projectTools: ToolDef[] = [
  {
    name: 'search_projects',
    description: 'Search and filter projects.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        name: { type: 'string', description: 'Filter by project name (partial match)' },
        state: { type: 'string', description: 'Filter by state: planned, started, paused, completed, canceled' },
        filter: { type: 'object', description: 'Raw ProjectFilter object (overrides convenience params)' },
        ...PAGINATION_PROPS,
      },
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      let filter = args.filter as Record<string, unknown> | undefined
      if (!filter) {
        filter = {}
        if (args.name) filter.name = { containsIgnoreCase: args.name }
        if (args.state) filter.state = { eq: args.state }
      }
      const variables: Record<string, unknown> = {
        filter: Object.keys(filter).length > 0 ? filter : undefined,
        first: (args.first as number) || 50,
        after: args.after as string | undefined,
      }
      const data = await client.query(SEARCH_PROJECTS_QUERY, variables)
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'list_project_statuses',
    description: 'List workspace-level project statuses. Use status IDs when creating or updating projects.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        includeArchived: { type: 'boolean', description: 'Include archived statuses (default: false)' },
        ...PAGINATION_PROPS,
      },
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(LIST_PROJECT_STATUSES_QUERY, {
        first: (args.first as number) || 50,
        after: args.after as string | undefined,
        includeArchived: (args.includeArchived as boolean) || false,
      })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'get_project_status',
    description: 'Get one project status by UUID.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Project status UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(GET_PROJECT_STATUS_QUERY, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'get_project',
    description: 'Get a project by ID with content, direct comments, issues, members, and status updates.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Project UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(GET_PROJECT_QUERY, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'create_project',
    description: 'Create a new project.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Optional client-generated project UUID' },
        name: { type: 'string', description: 'Project name (required)' },
        description: { type: 'string', description: 'Project description' },
        content: { type: 'string', description: 'Rich project content/body (markdown)' },
        teamIds: { type: 'array', items: { type: 'string' }, description: 'Team UUIDs (required)' },
        statusId: { type: 'string', description: 'Project status UUID' },
        state: { type: 'string', description: 'Legacy convenience: status name/type to resolve into statusId (e.g. planned, started, completed)' },
        leadId: { type: 'string', description: 'Project lead user UUID' },
        memberIds: { type: 'array', items: { type: 'string' }, description: 'Member user UUIDs' },
        startDate: { type: 'string', description: 'Start date (ISO 8601)' },
        targetDate: { type: 'string', description: 'Target date (ISO 8601)' },
        startDateResolution: { type: 'string', description: 'Date resolution for startDate (e.g. day, month, quarter, year)' },
        targetDateResolution: { type: 'string', description: 'Date resolution for targetDate (e.g. day, month, quarter, year)' },
        icon: { type: 'string', description: 'Project icon (:emoji_name: format)' },
        color: { type: 'string', description: 'Color hex (e.g. "#5e6ad2")' },
        priority: { type: 'integer', description: '0=none, 1=urgent, 2=high, 3=medium, 4=low' },
        labelIds: { type: 'array', items: { type: 'string' }, description: 'Project label UUIDs' },
        sortOrder: { type: 'number', description: 'Manual sort order' },
      },
      required: ['name', 'teamIds'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const input = await buildProjectInput(client, args)
      const data = await client.query(CREATE_PROJECT_MUTATION, { input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'update_project',
    description: 'Update an existing project.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Project UUID' },
        name: { type: 'string', description: 'New name' },
        description: { type: 'string', description: 'Short project description' },
        content: { type: 'string', description: 'New project description/content' },
        statusId: { type: 'string', description: 'Project status UUID' },
        state: { type: 'string', description: 'Legacy convenience: status name/type to resolve into statusId (e.g. planned, started, completed)' },
        leadId: { type: 'string', description: 'Project lead user UUID' },
        memberIds: { type: 'array', items: { type: 'string' }, description: 'Member user UUIDs' },
        startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        targetDate: { type: 'string', description: 'Target date (YYYY-MM-DD)' },
        icon: { type: 'string', description: 'Project icon (:emoji_name: format)' },
        color: { type: 'string', description: 'Color hex (e.g. "#5e6ad2")' },
        priority: { type: 'integer', description: '0=none, 1=urgent, 2=high, 3=medium, 4=low' },
        labelIds: { type: 'array', items: { type: 'string' }, description: 'Project label UUIDs' },
        teamIds: { type: 'array', items: { type: 'string' }, description: 'Team UUIDs (replaces all teams)' },
        sortOrder: { type: 'number', description: 'Manual sort order' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { id, ...rest } = args
      const input = await buildProjectInput(client, rest)
      const data = await client.query(UPDATE_PROJECT_MUTATION, { id, input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'archive_project',
    description: 'Archive a project. This uses Linear projectDelete, which is reversible via unarchive_project.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Project UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(ARCHIVE_PROJECT_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'unarchive_project',
    description: 'Restore an archived project.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Project UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(UNARCHIVE_PROJECT_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'create_project_status',
    description: 'Create a workspace-level project status. Types: backlog, planned, started, paused, completed, canceled.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Optional client-generated project status UUID' },
        name: { type: 'string', description: 'Status name (max 25 characters)' },
        color: { type: 'string', description: 'Color hex (e.g. "#5e6ad2")' },
        description: { type: 'string', description: 'Status description' },
        position: { type: 'number', description: 'Sort position' },
        type: { type: 'string', description: 'Status type: backlog, planned, started, paused, completed, canceled' },
        indefinite: { type: 'boolean', description: 'Whether the status is indefinite/ongoing' },
      },
      required: ['name', 'color', 'position', 'type'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, ...input } = args
      const data = await client.query(CREATE_PROJECT_STATUS_MUTATION, { input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'update_project_status',
    description: 'Update a workspace-level project status.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Project status UUID' },
        name: { type: 'string', description: 'Status name (max 25 characters)' },
        color: { type: 'string', description: 'Color hex (e.g. "#5e6ad2")' },
        description: { type: 'string', description: 'Status description' },
        position: { type: 'number', description: 'Sort position' },
        type: { type: 'string', description: 'Status type: backlog, planned, started, paused, completed, canceled' },
        indefinite: { type: 'boolean', description: 'Whether the status is indefinite/ongoing' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, id, ...input } = args
      const data = await client.query(UPDATE_PROJECT_STATUS_MUTATION, { id, input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'archive_project_status',
    description: 'Archive a project status. Reassign projects first if the status is in use.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Project status UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(ARCHIVE_PROJECT_STATUS_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'unarchive_project_status',
    description: 'Unarchive a project status.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Project status UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(UNARCHIVE_PROJECT_STATUS_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'reassign_project_status',
    description: 'Move all projects from one project status to another. Useful before archiving a status.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        originalProjectStatusId: { type: 'string', description: 'Current project status UUID' },
        newProjectStatusId: { type: 'string', description: 'Destination project status UUID' },
      },
      required: ['originalProjectStatusId', 'newProjectStatusId'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(REASSIGN_PROJECT_STATUS_MUTATION, {
        originalProjectStatusId: args.originalProjectStatusId,
        newProjectStatusId: args.newProjectStatusId,
      })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'create_project_update',
    description: 'Post a status update on a project with health indicator.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        projectId: { type: 'string', description: 'Project UUID (required)' },
        body: { type: 'string', description: 'Update body (markdown)' },
        health: { type: 'string', description: 'Health status: onTrack, atRisk, or offTrack' },
      },
      required: ['projectId'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, ...input } = args
      const data = await client.query(CREATE_PROJECT_UPDATE_MUTATION, { input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'update_project_update',
    description: 'Edit a project status update body and/or health.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Project update UUID' },
        body: { type: 'string', description: 'Updated markdown body' },
        bodyData: { description: 'Updated rich body JSON, when available' },
        health: { type: 'string', description: 'Health status: onTrack, atRisk, or offTrack' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, id, ...input } = args
      const data = await client.query(UPDATE_PROJECT_UPDATE_MUTATION, { id, input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'archive_project_update',
    description: 'Archive a project status update.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Project update UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(ARCHIVE_PROJECT_UPDATE_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'unarchive_project_update',
    description: 'Restore an archived project status update.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Project update UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(UNARCHIVE_PROJECT_UPDATE_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'create_project_relation',
    description: 'Create a project dependency relation. Type is currently "dependency"; anchorType values are start, end, or milestone.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Optional client-generated project relation UUID' },
        type: { type: 'string', description: 'Relation type. Linear currently accepts "dependency".' },
        projectId: { type: 'string', description: 'Source project UUID' },
        projectMilestoneId: { type: 'string', description: 'Source milestone UUID when anchorType is milestone' },
        anchorType: { type: 'string', description: 'Source anchor: start, end, or milestone' },
        relatedProjectId: { type: 'string', description: 'Related project UUID' },
        relatedProjectMilestoneId: { type: 'string', description: 'Related milestone UUID when relatedAnchorType is milestone' },
        relatedAnchorType: { type: 'string', description: 'Related anchor: start, end, or milestone' },
      },
      required: ['type', 'projectId', 'anchorType', 'relatedProjectId', 'relatedAnchorType'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, ...input } = args
      const data = await client.query(CREATE_PROJECT_RELATION_MUTATION, { input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'update_project_relation',
    description: 'Update a project dependency relation.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Project relation UUID' },
        type: { type: 'string', description: 'Relation type. Linear currently accepts "dependency".' },
        projectId: { type: 'string', description: 'Source project UUID' },
        projectMilestoneId: { type: 'string', description: 'Source milestone UUID when anchorType is milestone' },
        anchorType: { type: 'string', description: 'Source anchor: start, end, or milestone' },
        relatedProjectId: { type: 'string', description: 'Related project UUID' },
        relatedProjectMilestoneId: { type: 'string', description: 'Related milestone UUID when relatedAnchorType is milestone' },
        relatedAnchorType: { type: 'string', description: 'Related anchor: start, end, or milestone' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, id, ...input } = args
      const data = await client.query(UPDATE_PROJECT_RELATION_MUTATION, { id, input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'delete_project_relation',
    description: 'Delete a project relation.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Project relation UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(DELETE_PROJECT_RELATION_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'add_project_label',
    description: 'Attach a project label to a project.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Project UUID' },
        labelId: { type: 'string', description: 'Project label UUID' },
      },
      required: ['id', 'labelId'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(ADD_PROJECT_LABEL_MUTATION, { id: args.id, labelId: args.labelId })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'remove_project_label',
    description: 'Remove a project label from a project.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Project UUID' },
        labelId: { type: 'string', description: 'Project label UUID' },
      },
      required: ['id', 'labelId'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(REMOVE_PROJECT_LABEL_MUTATION, { id: args.id, labelId: args.labelId })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'create_project_milestone',
    description: 'Create a milestone within a project.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        projectId: { type: 'string', description: 'Project UUID (required)' },
        name: { type: 'string', description: 'Milestone name (required)' },
        description: { type: 'string', description: 'Milestone description' },
        targetDate: { type: 'string', description: 'Target date (YYYY-MM-DD)' },
      },
      required: ['projectId', 'name'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, ...input } = args
      const data = await client.query(CREATE_PROJECT_MILESTONE_MUTATION, { input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'update_project_milestone',
    description: 'Update a project milestone.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Milestone UUID (required)' },
        name: { type: 'string', description: 'New name' },
        description: { type: 'string', description: 'New description' },
        targetDate: { type: 'string', description: 'New target date (YYYY-MM-DD)' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, id, ...input } = args
      const data = await client.query(UPDATE_PROJECT_MILESTONE_MUTATION, { id, input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'delete_project_milestone',
    description: 'Delete a project milestone.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Milestone UUID (required)' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(DELETE_PROJECT_MILESTONE_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
]
