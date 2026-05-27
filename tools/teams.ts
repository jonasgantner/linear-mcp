import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'

const GET_TEAMS_QUERY = `
  query GetTeams {
    teams {
      nodes {
        id name key description
        cyclesEnabled cycleStartDay cycleDuration cycleCooldownTime
        cycleIssueAutoAssignStarted cycleIssueAutoAssignCompleted cycleLockToActive
        upcomingCycleCount cycleCalenderUrl
        issueEstimationType issueEstimationExtended issueEstimationAllowZero defaultIssueEstimate
        triageEnabled requirePriorityToLeaveTriage
        members { nodes { id name email active } }
      }
    }
  }
`

const UPDATE_TEAM_MUTATION = `
  mutation UpdateTeam($id: String!, $input: TeamUpdateInput!) {
    teamUpdate(id: $id, input: $input) {
      success
      team {
        id name key
        cyclesEnabled cycleStartDay cycleDuration cycleCooldownTime
        cycleIssueAutoAssignStarted cycleIssueAutoAssignCompleted cycleLockToActive
        upcomingCycleCount
        issueEstimationType issueEstimationExtended issueEstimationAllowZero defaultIssueEstimate
        triageEnabled requirePriorityToLeaveTriage
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
  {
    name: 'update_team',
    description: 'Update team settings: cycle config (start day, duration, auto-assign), estimate config (type, extended, allow zero, default), triage. issueEstimationType accepts: notUsed, exponential, fibonacci, linear, tShirt. defaultIssueEstimate is API-capped to 0 or 1.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Team UUID (required)' },
        name: { type: 'string', description: 'Team name' },
        key: { type: 'string', description: 'Team key (e.g. "SPE")' },
        description: { type: 'string', description: 'Team description' },
        cyclesEnabled: { type: 'boolean', description: 'Enable cycles for this team' },
        cycleStartDay: { type: 'number', description: 'Day of week cycles start (0=Sun, 1=Mon, ...)' },
        cycleDuration: { type: 'integer', description: 'Cycle length in weeks' },
        cycleCooldownTime: { type: 'integer', description: 'Cooldown days between cycles' },
        cycleIssueAutoAssignStarted: { type: 'boolean', description: 'Auto-assign in-progress issues to active cycle' },
        cycleIssueAutoAssignCompleted: { type: 'boolean', description: 'Keep completed issues assigned to their cycle' },
        cycleLockToActive: { type: 'boolean', description: 'Restrict issue movement to active cycle only' },
        upcomingCycleCount: { type: 'number', description: 'Number of future cycles to pre-create' },
        issueEstimationType: { type: 'string', description: 'Scale: notUsed | exponential | fibonacci | linear | tShirt' },
        issueEstimationExtended: { type: 'boolean', description: 'Extend scale with higher values (e.g. fibonacci adds 13, 21)' },
        issueEstimationAllowZero: { type: 'boolean', description: 'Allow 0-point estimates (signal-only / blocked)' },
        defaultIssueEstimate: { type: 'number', description: 'Default estimate on new issues. API caps to 0 or 1.' },
        triageEnabled: { type: 'boolean', description: 'Enable Triage queue' },
        requirePriorityToLeaveTriage: { type: 'boolean', description: 'Require priority set before leaving Triage' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, id, ...input } = args
      const data = await client.query(UPDATE_TEAM_MUTATION, { id, input })
      return JSON.stringify(data, null, 2)
    },
  },
]
