import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'

const GET_TEAMS_QUERY = `
  query GetTeams {
    teams {
      nodes {
        id name key description
        members { nodes { id name email active } }
      }
    }
  }
`

const GET_TEAM_STATES_QUERY = `
  query GetTeamStates($teamId: String!) {
    team(id: $teamId) {
      states { nodes { id name type color position } }
    }
  }
`

const GET_TEAM_LABELS_QUERY = `
  query GetTeamLabels($teamId: String!) {
    team(id: $teamId) {
      labels { nodes { id name color } }
    }
  }
`

export const teamTools: ToolDef[] = [
  {
    name: 'get_teams',
    description: 'List all teams in the workspace with their members. Use "include" to also fetch workflow states and/or labels (separate queries to avoid complexity limits).',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        include: {
          type: 'array',
          items: { type: 'string', enum: ['states', 'labels'] },
          description: 'Additional data to include: "states" (workflow states), "labels" (issue labels). Omit for just teams + members.',
        },
      },
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query<{ teams: { nodes: Array<{ id: string; name: string; key: string }> } }>(GET_TEAMS_QUERY)
      const include = (args.include as string[] | undefined) ?? []

      if (include.length === 0) return JSON.stringify(data, null, 2)

      const teams = data.teams.nodes
      const enriched: Record<string, unknown>[] = []

      for (const team of teams) {
        const entry: Record<string, unknown> = { ...team }
        if (include.includes('states')) {
          const s = await client.query<{ team: { states: unknown } }>(GET_TEAM_STATES_QUERY, { teamId: team.id })
          entry.states = s.team.states
        }
        if (include.includes('labels')) {
          const l = await client.query<{ team: { labels: unknown } }>(GET_TEAM_LABELS_QUERY, { teamId: team.id })
          entry.labels = l.team.labels
        }
        enriched.push(entry)
      }

      return JSON.stringify({ teams: { nodes: enriched } }, null, 2)
    },
  },
]
