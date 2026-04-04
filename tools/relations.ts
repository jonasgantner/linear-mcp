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

const DELETE_ISSUE_RELATION_MUTATION = `
  mutation DeleteIssueRelation($id: String!) {
    issueRelationDelete(id: $id) { success }
  }
`

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
