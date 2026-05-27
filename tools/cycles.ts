import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP, PAGINATION_PROPS } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'

const LIST_CYCLES_QUERY = `
  query ListCycles($filter: CycleFilter, $first: Int, $after: String) {
    cycles(filter: $filter, first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id number name description startsAt endsAt completedAt
        progress
        team { id name key }
        issues { nodes { id identifier title state { name } priority assignee { name } } }
      }
    }
  }
`

const CREATE_CYCLE_MUTATION = `
  mutation CreateCycle($input: CycleCreateInput!) {
    cycleCreate(input: $input) {
      success
      cycle { id number name startsAt endsAt team { key } }
    }
  }
`

const UPDATE_CYCLE_MUTATION = `
  mutation UpdateCycle($id: String!, $input: CycleUpdateInput!) {
    cycleUpdate(id: $id, input: $input) {
      success
      cycle { id number name startsAt endsAt }
    }
  }
`

const CYCLE_ARCHIVE_MUTATION = `
  mutation CycleArchive($id: String!) {
    cycleArchive(id: $id) { success }
  }
`

export const cycleTools: ToolDef[] = [
  {
    name: 'list_cycles',
    description: 'List cycles (sprints) for a team. Use "type" for quick access to current/next/previous cycle.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        teamId: { type: 'string', description: 'Team UUID (filters cycles to this team)' },
        type: { type: 'string', description: 'Quick filter: "current", "next", or "previous". Omit for all cycles.' },
        filter: { type: 'object', description: 'Raw CycleFilter object' },
        ...PAGINATION_PROPS,
      },
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)

      let filter = args.filter as Record<string, unknown> | undefined
      if (!filter) {
        filter = {}
        if (args.teamId) filter.team = { id: { eq: args.teamId } }

        const now = new Date().toISOString()
        if (args.type === 'current') {
          filter.startsAt = { lte: now }
          filter.endsAt = { gte: now }
        } else if (args.type === 'next') {
          filter.startsAt = { gt: now }
        } else if (args.type === 'previous') {
          filter.endsAt = { lt: now }
        }
      }

      const first = args.type === 'next' || args.type === 'previous'
        ? 1
        : (args.first as number) || 10

      const variables: Record<string, unknown> = {
        filter: Object.keys(filter).length > 0 ? filter : undefined,
        first,
        after: args.after as string | undefined,
      }
      const data = await client.query(LIST_CYCLES_QUERY, variables)
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'create_cycle',
    description: 'Create a new cycle (sprint) for a team.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        teamId: { type: 'string', description: 'Team UUID (required)' },
        name: { type: 'string', description: 'Cycle name' },
        description: { type: 'string', description: 'Cycle description' },
        startsAt: { type: 'string', description: 'Start datetime ISO 8601 (required)' },
        endsAt: { type: 'string', description: 'End datetime ISO 8601 (required)' },
      },
      required: ['teamId', 'startsAt', 'endsAt'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, ...input } = args
      const data = await client.query(CREATE_CYCLE_MUTATION, { input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'update_cycle',
    description: 'Update an existing cycle.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Cycle UUID (required)' },
        name: { type: 'string', description: 'New name' },
        description: { type: 'string', description: 'New description' },
        startsAt: { type: 'string', description: 'New start datetime' },
        endsAt: { type: 'string', description: 'New end datetime' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, id, ...input } = args
      const data = await client.query(UPDATE_CYCLE_MUTATION, { id, input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'cycle_archive',
    description: 'Archive a cycle. Linear has no hard-delete for cycles; archiving removes from active views while preserving history. Note: Linear rejects archiving the currently-active cycle.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Cycle UUID (required)' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(CYCLE_ARCHIVE_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
]
