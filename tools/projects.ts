import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP, PAGINATION_PROPS } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'

const SEARCH_PROJECTS_QUERY = `
  query SearchProjects($filter: ProjectFilter, $first: Int, $after: String) {
    projects(filter: $filter, first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id name description url state startDate targetDate progress
        lead { id name }
        teams { nodes { id name key } }
        members { nodes { id name } }
      }
    }
  }
`

const GET_PROJECT_QUERY = `
  query GetProject($id: String!) {
    project(id: $id) {
      id name description url state icon color priority startDate targetDate progress
      lead { id name }
      teams { nodes { id name key } }
      members { nodes { id name } }
      issues { nodes { id identifier title state { name } priority assignee { name } } }
      projectMilestones { nodes { id name description targetDate sortOrder } }
      projectUpdates { nodes { id body health createdAt user { name } } }
    }
  }
`

const CREATE_PROJECT_MUTATION = `
  mutation CreateProject($input: ProjectCreateInput!) {
    projectCreate(input: $input) {
      success
      project { id name url }
    }
  }
`

const UPDATE_PROJECT_MUTATION = `
  mutation UpdateProject($id: String!, $input: ProjectUpdateInput!) {
    projectUpdate(id: $id, input: $input) {
      success
      project { id name url state icon color priority }
    }
  }
`

const CREATE_PROJECT_UPDATE_MUTATION = `
  mutation CreateProjectUpdate($input: ProjectUpdateCreateInput!) {
    projectUpdateCreate(input: $input) {
      success
      projectUpdate { id body health createdAt user { name } }
    }
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
    name: 'get_project',
    description: 'Get a project by ID with issues, members, and status updates.',
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
        name: { type: 'string', description: 'Project name (required)' },
        description: { type: 'string', description: 'Project description' },
        teamIds: { type: 'array', items: { type: 'string' }, description: 'Team UUIDs (required)' },
        state: { type: 'string', description: 'Initial state: planned, started, paused, completed, canceled' },
        leadId: { type: 'string', description: 'Project lead user UUID' },
        startDate: { type: 'string', description: 'Start date (ISO 8601)' },
        targetDate: { type: 'string', description: 'Target date (ISO 8601)' },
      },
      required: ['name', 'teamIds'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, ...input } = args
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
        content: { type: 'string', description: 'New project description/content' },
        state: { type: 'string', description: 'New state: planned, started, paused, completed, canceled' },
        leadId: { type: 'string', description: 'Project lead user UUID' },
        memberIds: { type: 'array', items: { type: 'string' }, description: 'Member user UUIDs' },
        startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        targetDate: { type: 'string', description: 'Target date (YYYY-MM-DD)' },
        icon: { type: 'string', description: 'Project icon (:emoji_name: format)' },
        color: { type: 'string', description: 'Color hex (e.g. "#5e6ad2")' },
        priority: { type: 'integer', description: '0=none, 1=urgent, 2=high, 3=medium, 4=low' },
        labelIds: { type: 'array', items: { type: 'string' }, description: 'Project label UUIDs' },
        teamIds: { type: 'array', items: { type: 'string' }, description: 'Team UUIDs (replaces all teams)' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, id, ...input } = args
      const data = await client.query(UPDATE_PROJECT_MUTATION, { id, input })
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
