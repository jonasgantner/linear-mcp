import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP, PAGINATION_PROPS } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'

const LIST_INITIATIVES_QUERY = `
  query ListInitiatives($first: Int, $after: String) {
    initiatives(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id name description status color icon
        targetDate
        owner { id name }
        projects { nodes { id name state progress } }
        createdAt updatedAt
      }
    }
  }
`

const GET_INITIATIVE_QUERY = `
  query GetInitiative($id: String!) {
    initiative(id: $id) {
      id name description status color icon
      targetDate
      owner { id name }
      projects { nodes { id name state progress } }
      initiativeUpdates { nodes { id body health createdAt } }
      createdAt updatedAt
    }
  }
`

const CREATE_INITIATIVE_MUTATION = `
  mutation CreateInitiative($input: InitiativeCreateInput!) {
    initiativeCreate(input: $input) {
      success
      initiative { id name status color }
    }
  }
`

const UPDATE_INITIATIVE_MUTATION = `
  mutation UpdateInitiative($id: String!, $input: InitiativeUpdateInput!) {
    initiativeUpdate(id: $id, input: $input) {
      success
      initiative { id name status color }
    }
  }
`

const LINK_INITIATIVE_PROJECT_MUTATION = `
  mutation LinkInitiativeProject($input: InitiativeToProjectCreateInput!) {
    initiativeToProjectCreate(input: $input) {
      success
    }
  }
`

const CREATE_INITIATIVE_UPDATE_MUTATION = `
  mutation CreateInitiativeUpdate($input: InitiativeUpdateCreateInput!) {
    initiativeUpdateCreate(input: $input) {
      success
      initiativeUpdate { id body health createdAt }
    }
  }
`

export const initiativeTools: ToolDef[] = [
  {
    name: 'list_initiatives',
    description: 'List all initiatives in the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        ...PAGINATION_PROPS,
      },
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(LIST_INITIATIVES_QUERY, {
        first: (args.first as number) || 50,
        after: args.after as string | undefined,
      })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'get_initiative',
    description: 'Get a single initiative by ID with its linked projects.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Initiative UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(GET_INITIATIVE_QUERY, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'create_initiative',
    description: 'Create a new initiative.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        name: { type: 'string', description: 'Initiative name (required)' },
        description: { type: 'string', description: 'Initiative description' },
        status: { type: 'string', description: 'Status: Planned, Active, or Completed' },
        ownerId: { type: 'string', description: 'Owner user UUID' },
        color: { type: 'string', description: 'Color hex (e.g. "#5e6ad2")' },
        targetDate: { type: 'string', description: 'Target date (YYYY-MM-DD)' },
      },
      required: ['name'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, ...input } = args
      const data = await client.query(CREATE_INITIATIVE_MUTATION, { input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'update_initiative',
    description: 'Update an existing initiative.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Initiative UUID' },
        name: { type: 'string', description: 'New name' },
        description: { type: 'string', description: 'Short summary (max 255 chars)' },
        content: { type: 'string', description: 'Rich body/description (markdown, no length limit)' },
        status: { type: 'string', description: 'Status: Planned, Active, or Completed' },
        ownerId: { type: 'string', description: 'Owner user UUID' },
        color: { type: 'string', description: 'Color hex' },
        targetDate: { type: 'string', description: 'Target date (YYYY-MM-DD)' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, id, ...input } = args
      const data = await client.query(UPDATE_INITIATIVE_MUTATION, { id, input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'link_initiative_project',
    description: 'Link a project to an initiative.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        initiativeId: { type: 'string', description: 'Initiative UUID' },
        projectId: { type: 'string', description: 'Project UUID' },
      },
      required: ['initiativeId', 'projectId'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(LINK_INITIATIVE_PROJECT_MUTATION, {
        input: { initiativeId: args.initiativeId, projectId: args.projectId },
      })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'create_initiative_update',
    description: 'Post a status update on an initiative with health indicator.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        initiativeId: { type: 'string', description: 'Initiative UUID (required)' },
        body: { type: 'string', description: 'Update body (markdown)' },
        health: { type: 'string', description: 'Health: onTrack, atRisk, or offTrack' },
      },
      required: ['initiativeId'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, ...input } = args
      const data = await client.query(CREATE_INITIATIVE_UPDATE_MUTATION, { input })
      return JSON.stringify(data, null, 2)
    },
  },
]
