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
          description: 'Array of issue inputs. Each must include teamId and title. Supports all create_issue fields: description, priority, stateId, assigneeId, labelIds, cycleId, projectId, projectMilestoneId, dueDate, estimate, parentId, and subscriberIds.',
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
    description: 'Apply the same update to multiple issues at once. Pass an array of issue UUIDs and the fields to update (same as update_issue). Supports null to clear some fields; if any issue ID is invalid, Linear rejects the batch operation.',
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
        assigneeId: { type: ['string', 'null'], description: 'Assignee user UUID, or null to unassign' },
        dueDate: { type: ['string', 'null'], description: 'Due date YYYY-MM-DD, or null to clear' },
        cycleId: { type: ['string', 'null'], description: 'Cycle UUID, or null to remove from cycle' },
        projectId: { type: ['string', 'null'], description: 'Project UUID to move all issues to the project, or null to clear project' },
        projectMilestoneId: { type: ['string', 'null'], description: 'Project milestone UUID, or null to remove from milestone' },
        estimate: { type: ['number', 'null'], description: 'Point estimate, or null to clear estimate' },
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
