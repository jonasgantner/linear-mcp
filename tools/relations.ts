import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'

const CREATE_ISSUE_RELATION_MUTATION = `
  mutation CreateIssueRelation($input: IssueRelationCreateInput!) {
    issueRelationCreate(input: $input) {
      success
      issueRelation {
        id type
        issue { id identifier title }
        relatedIssue { id identifier title }
      }
    }
  }
`

const GET_DUPLICATE_ISSUE_QUERY = `
  query GetDuplicateIssue($id: String!) {
    issue(id: $id) {
      id identifier title
      state { id name type }
      team {
        id name key
        states { nodes { id name type color } }
      }
      relations { nodes { id type relatedIssue { id identifier title } } }
      inverseRelations { nodes { id type issue { id identifier title } } }
    }
  }
`

const UPDATE_ISSUE_STATE_MUTATION = `
  mutation UpdateIssueState($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) {
      success
      issue {
        id identifier title
        state { id name type }
        relations { nodes { id type relatedIssue { id identifier title } } }
        inverseRelations { nodes { id type issue { id identifier title } } }
      }
    }
  }
`

const DELETE_ISSUE_RELATION_MUTATION = `
  mutation DeleteIssueRelation($id: String!) {
    issueRelationDelete(id: $id) { success }
  }
`

type DuplicateIssue = {
  id: string
  identifier: string
  title: string
  state?: { id: string; name: string; type: string }
  team?: { states?: { nodes: Array<{ id: string; name: string; type: string }> } }
  relations?: { nodes: Array<{ id: string; type: string; relatedIssue?: { id: string; identifier: string; title: string } }> }
  inverseRelations?: { nodes: Array<{ id: string; type: string; issue?: { id: string; identifier: string; title: string } }> }
}

function findDuplicateState(issue: DuplicateIssue, duplicateStateId?: unknown): string {
  if (typeof duplicateStateId === 'string' && duplicateStateId.trim()) return duplicateStateId
  const states = issue.team?.states?.nodes ?? []
  const duplicate = states.find(state => state.type === 'duplicate')
    ?? states.find(state => state.name.toLowerCase() === 'duplicate')
  if (!duplicate) {
    throw new Error(`No Duplicate workflow state found for ${issue.identifier}; call get_teams(include:["states"]) and pass duplicateStateId explicitly if needed.`)
  }
  return duplicate.id
}

function findExistingDuplicateRelation(issue: DuplicateIssue, duplicateOfIssueId: unknown) {
  if (typeof duplicateOfIssueId !== 'string') return undefined
  return issue.relations?.nodes.find(relation =>
    relation.type === 'duplicate' && relation.relatedIssue?.id === duplicateOfIssueId)
}

export const relationTools: ToolDef[] = [
  {
    name: 'create_issue_relation',
    description: 'Create a relation between two issues (blocks, duplicate, related, similar).',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        type: { type: 'string', description: 'Relation type: blocks, duplicate, related, or similar (required)' },
        issueId: { type: 'string', description: 'Source issue UUID (required)' },
        relatedIssueId: { type: 'string', description: 'Target issue UUID (required)' },
      },
      required: ['type', 'issueId', 'relatedIssueId'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, ...input } = args
      const data = await client.query(CREATE_ISSUE_RELATION_MUTATION, { input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'mark_issue_duplicate',
    description: 'Mark one issue as a duplicate of another. Ensures a duplicate relation exists from issueId to duplicateOfIssueId, then moves issueId to the team Duplicate workflow state.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        issueId: { type: 'string', description: 'Issue UUID to mark as duplicate' },
        duplicateOfIssueId: { type: 'string', description: 'Canonical issue UUID that issueId duplicates' },
        duplicateStateId: { type: 'string', description: 'Optional Duplicate workflow state UUID. If omitted, the tool reads the issue team states and uses state type duplicate.' },
      },
      required: ['issueId', 'duplicateOfIssueId'],
    },
    examples: [
      {
        title: 'Mark duplicate',
        args: { workspace: 'personal', issueId: 'duplicate-issue-uuid', duplicateOfIssueId: 'canonical-issue-uuid' },
      },
    ],
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const issueData = await client.query<{ issue: DuplicateIssue }>(GET_DUPLICATE_ISSUE_QUERY, { id: args.issueId })
      const duplicateStateId = findDuplicateState(issueData.issue, args.duplicateStateId)
      const existingRelation = findExistingDuplicateRelation(issueData.issue, args.duplicateOfIssueId)

      let relationCreated = false
      let relation = existingRelation
      if (!relation) {
        const createData = await client.query<{
          issueRelationCreate: { issueRelation: NonNullable<typeof relation> }
        }>(CREATE_ISSUE_RELATION_MUTATION, {
          input: {
            type: 'duplicate',
            issueId: args.issueId,
            relatedIssueId: args.duplicateOfIssueId,
          },
        })
        relation = createData.issueRelationCreate.issueRelation
        relationCreated = true
      }

      try {
        const stateData = await client.query(UPDATE_ISSUE_STATE_MUTATION, {
          id: args.issueId,
          input: { stateId: duplicateStateId },
        })
        return JSON.stringify({
          success: true,
          relationCreated,
          duplicateStateId,
          relation,
          stateUpdate: stateData,
        }, null, 2)
      } catch (err) {
        return JSON.stringify({
          success: false,
          phase: 'stateUpdate',
          relationCreated,
          duplicateStateId,
          relation,
          error: err instanceof Error ? err.message : String(err),
        }, null, 2)
      }
    },
  },
  {
    name: 'delete_issue_relation',
    description: 'Delete a relation between two issues.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Relation UUID (required)' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(DELETE_ISSUE_RELATION_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
]
