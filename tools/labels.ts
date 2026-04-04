import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP, PAGINATION_PROPS } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'

const LIST_LABELS_QUERY = `
  query ListLabels($filter: IssueLabelFilter, $first: Int, $after: String) {
    issueLabels(filter: $filter, first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id name color description isGroup
        parent { id name }
        children { nodes { id name color } }
        team { id name key }
      }
    }
  }
`

const CREATE_ISSUE_LABEL_MUTATION = `
  mutation CreateIssueLabel($input: IssueLabelCreateInput!) {
    issueLabelCreate(input: $input) {
      success
      issueLabel { id name color description isGroup parent { id name } team { id name key } }
    }
  }
`

const CREATE_PROJECT_LABEL_MUTATION = `
  mutation CreateProjectLabel($input: ProjectLabelCreateInput!) {
    projectLabelCreate(input: $input) {
      success
      projectLabel { id name color description isGroup parent { id name } }
    }
  }
`

export const labelTools: ToolDef[] = [
  {
    name: 'list_labels',
    description: 'List issue labels. Optionally filter by team.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        teamId: { type: 'string', description: 'Team UUID to filter labels' },
        filter: { type: 'object', description: 'Raw IssueLabelFilter object' },
        ...PAGINATION_PROPS,
      },
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      let filter = args.filter as Record<string, unknown> | undefined
      if (!filter && args.teamId) {
        filter = { team: { id: { eq: args.teamId } } }
      }
      const variables: Record<string, unknown> = {
        filter: filter && Object.keys(filter).length > 0 ? filter : undefined,
        first: (args.first as number) || 100,
        after: args.after as string | undefined,
      }
      const data = await client.query(LIST_LABELS_QUERY, variables)
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'create_issue_label',
    description: 'Create an issue label. Set isGroup=true for a label group (parent), then use parentId on child labels.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        name: { type: 'string', description: 'Label name (required)' },
        description: { type: 'string', description: 'Label description' },
        color: { type: 'string', description: 'Color hex (e.g. "#5e6ad2")' },
        isGroup: { type: 'boolean', description: 'True to create a label group (parent)' },
        parentId: { type: 'string', description: 'Parent label UUID (to create a child label)' },
        teamId: { type: 'string', description: 'Team UUID (omit for workspace-wide label)' },
      },
      required: ['name'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, ...input } = args
      const data = await client.query(CREATE_ISSUE_LABEL_MUTATION, { input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'create_project_label',
    description: 'Create a project label. Set isGroup=true for a label group.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        name: { type: 'string', description: 'Label name (required)' },
        description: { type: 'string', description: 'Label description' },
        color: { type: 'string', description: 'Color hex (e.g. "#5e6ad2")' },
        isGroup: { type: 'boolean', description: 'True to create a label group (parent)' },
        parentId: { type: 'string', description: 'Parent label UUID (to create a child label)' },
      },
      required: ['name'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, ...input } = args
      const data = await client.query(CREATE_PROJECT_LABEL_MUTATION, { input })
      return JSON.stringify(data, null, 2)
    },
  },
]
