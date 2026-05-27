import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'

const BATCH_CREATE_MUTATION = `
  mutation IssueBatchCreate($input: IssueBatchCreateInput!) {
    issueBatchCreate(input: $input) {
      success
      issues {
        id identifier title url
        team { key }
        state { name }
        assignee { name }
        priority
        parent { identifier }
      }
    }
  }
`

const BATCH_UPDATE_MUTATION = `
  mutation IssueBatchUpdate($input: IssueUpdateInput!, $ids: [UUID!]!) {
    issueBatchUpdate(input: $input, ids: $ids) {
      success
      issues {
        id identifier title url
        state { name }
        assignee { name }
        priority dueDate
      }
    }
  }
`

export const batchTools: ToolDef[] = [
  {
    name: 'issue_batch_create',
    description: 'Create multiple issues in a single API call. Each issue uses the same IssueCreateInput format as create_issue. Supports cross-team creation.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        issues: {
          type: 'array',
          description: 'Array of issue inputs. Each must include teamId and title. Supports all create_issue fields: description, priority, stateId, assigneeId, labelIds, cycleId, projectId, dueDate, estimate, parentId.',
          items: { type: 'object' },
        },
      },
      required: ['issues'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const issues = args.issues as Record<string, unknown>[]
      const data = await client.query(BATCH_CREATE_MUTATION, { input: { issues } })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'issue_batch_update',
    description: 'Apply the same update to multiple issues at once. Pass an array of issue UUIDs and the fields to update (same as update_issue). Supports null to clear fields.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        ids: {
          type: 'array',
          description: 'Array of issue UUIDs to update',
          items: { type: 'string' },
        },
        priority: { type: 'integer', description: 'Priority (0=none, 1=urgent, 2=high, 3=medium, 4=low)' },
        stateId: { type: 'string', description: 'Workflow state UUID' },
        assigneeId: { type: 'string', description: 'Assignee user UUID (null to unassign)' },
        dueDate: { type: 'string', description: 'Due date YYYY-MM-DD (null to clear)' },
        cycleId: { type: 'string', description: 'Cycle UUID' },
        projectId: { type: 'string', description: 'Project UUID. Set to null through raw JSON to clear if Linear accepts the clear.' },
        projectMilestoneId: { type: 'string', description: 'Project milestone UUID. Set to null through raw JSON to remove from a milestone if Linear accepts the clear.' },
        addedLabelIds: { type: 'array', items: { type: 'string' }, description: 'Label UUIDs to add' },
        removedLabelIds: { type: 'array', items: { type: 'string' }, description: 'Label UUIDs to remove' },
      },
      required: ['ids'],
    },
    examples: [
      {
        title: 'Bulk move',
        args: {
          workspace: 'personal',
          ids: ['issue-uuid-1', 'issue-uuid-2'],
          projectId: 'project-uuid',
          projectMilestoneId: 'milestone-uuid',
        },
      },
    ],
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, ids, ...input } = args
      const data = await client.query(BATCH_UPDATE_MUTATION, { input, ids })
      return JSON.stringify(data, null, 2)
    },
  },
]
