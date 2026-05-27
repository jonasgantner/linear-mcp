import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP, PAGINATION_PROPS } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'

const LIST_LABELS_QUERY = `
  query ListLabels($filter: IssueLabelFilter, $first: Int, $after: String, $includeArchived: Boolean) {
    issueLabels(filter: $filter, first: $first, after: $after, includeArchived: $includeArchived) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id name color description isGroup archivedAt retiredAt lastAppliedAt
        parent { id name color }
        children { nodes { id name color } }
        team { id name key }
      }
    }
  }
`

const GET_ISSUE_LABEL_QUERY = `
  query GetIssueLabel($id: String!) {
    issueLabel(id: $id) {
      id name color description isGroup archivedAt retiredAt lastAppliedAt
      parent { id name color }
      children { nodes { id name color archivedAt retiredAt } }
      team { id name key }
    }
  }
`

const LIST_PROJECT_LABELS_QUERY = `
  query ListProjectLabels($filter: ProjectLabelFilter, $first: Int, $after: String, $includeArchived: Boolean) {
    projectLabels(filter: $filter, first: $first, after: $after, includeArchived: $includeArchived) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id name color description isGroup archivedAt retiredAt lastAppliedAt
        parent { id name color }
        children { nodes { id name color archivedAt retiredAt } }
      }
    }
  }
`

const GET_PROJECT_LABEL_QUERY = `
  query GetProjectLabel($id: String!) {
    projectLabel(id: $id) {
      id name color description isGroup archivedAt retiredAt lastAppliedAt
      parent { id name color }
      children { nodes { id name color archivedAt retiredAt } }
    }
  }
`

const CREATE_ISSUE_LABEL_MUTATION = `
  mutation CreateIssueLabel($input: IssueLabelCreateInput!, $replaceTeamLabels: Boolean) {
    issueLabelCreate(input: $input, replaceTeamLabels: $replaceTeamLabels) {
      success
      issueLabel { id name color description isGroup archivedAt retiredAt parent { id name } team { id name key } }
    }
  }
`

const UPDATE_ISSUE_LABEL_MUTATION = `
  mutation UpdateIssueLabel($id: String!, $input: IssueLabelUpdateInput!, $replaceTeamLabels: Boolean) {
    issueLabelUpdate(id: $id, input: $input, replaceTeamLabels: $replaceTeamLabels) {
      success
      issueLabel { id name color description isGroup archivedAt retiredAt parent { id name } team { id name key } }
    }
  }
`

const CREATE_PROJECT_LABEL_MUTATION = `
  mutation CreateProjectLabel($input: ProjectLabelCreateInput!) {
    projectLabelCreate(input: $input) {
      success
      projectLabel { id name color description isGroup archivedAt retiredAt parent { id name } }
    }
  }
`

const UPDATE_PROJECT_LABEL_MUTATION = `
  mutation UpdateProjectLabel($id: String!, $input: ProjectLabelUpdateInput!) {
    projectLabelUpdate(id: $id, input: $input) {
      success
      projectLabel { id name color description isGroup archivedAt retiredAt parent { id name } }
    }
  }
`

const ISSUE_LABEL_RETIRE_MUTATION = `
  mutation IssueLabelRetire($id: String!) {
    issueLabelRetire(id: $id) {
      success
      issueLabel { id name color description isGroup archivedAt retiredAt }
    }
  }
`

const ISSUE_LABEL_RESTORE_MUTATION = `
  mutation IssueLabelRestore($id: String!) {
    issueLabelRestore(id: $id) {
      success
      issueLabel { id name color description isGroup archivedAt retiredAt }
    }
  }
`

const DELETE_ISSUE_LABEL_MUTATION = `
  mutation DeleteIssueLabel($id: String!) {
    issueLabelDelete(id: $id) { success }
  }
`

const PROJECT_LABEL_RETIRE_MUTATION = `
  mutation ProjectLabelRetire($id: String!) {
    projectLabelRetire(id: $id) {
      success
      projectLabel { id name color description isGroup archivedAt retiredAt }
    }
  }
`

const PROJECT_LABEL_RESTORE_MUTATION = `
  mutation ProjectLabelRestore($id: String!) {
    projectLabelRestore(id: $id) {
      success
      projectLabel { id name color description isGroup archivedAt retiredAt }
    }
  }
`

const DELETE_PROJECT_LABEL_MUTATION = `
  mutation DeleteProjectLabel($id: String!) {
    projectLabelDelete(id: $id) { success }
  }
`

export const labelTools: ToolDef[] = [
  {
    name: 'list_labels',
    description: 'List issue labels. Omit teamId to include workspace-level labels; pass teamId only when you intentionally need team-scoped labels.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        teamId: { type: 'string', description: 'Team UUID to filter labels' },
        filter: { type: 'object', description: 'Raw IssueLabelFilter object' },
        includeArchived: { type: 'boolean', description: 'Include archived/deleted labels (default: false)' },
        ...PAGINATION_PROPS,
      },
    },
    examples: [
      {
        title: 'Workspace labels',
        args: { workspace: 'personal', first: 100 },
      },
      {
        title: 'Team labels',
        args: { workspace: 'personal', teamId: 'team-uuid', first: 100 },
      },
    ],
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
        includeArchived: (args.includeArchived as boolean) || false,
      }
      const data = await client.query(LIST_LABELS_QUERY, variables)
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'get_issue_label',
    description: 'Get one issue label by UUID with parent/child and retired/archive metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Issue label UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(GET_ISSUE_LABEL_QUERY, { id: args.id })
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
        replaceTeamLabels: { type: 'boolean', description: 'Linear replaceTeamLabels flag for team label migration; omit unless intentionally replacing team labels' },
      },
      required: ['name'],
    },
    examples: [
      {
        title: 'Workspace label group',
        args: { workspace: 'personal', name: 'Linear MCP Sandbox', color: '#5e6ad2', isGroup: true },
      },
    ],
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, replaceTeamLabels, ...input } = args
      const data = await client.query(CREATE_ISSUE_LABEL_MUTATION, { input, replaceTeamLabels })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'update_issue_label',
    description: 'Update an issue label name, description, color, parent, group flag, or retiredAt timestamp.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Issue label UUID' },
        name: { type: 'string', description: 'New label name' },
        description: { type: 'string', description: 'New label description' },
        color: { type: 'string', description: 'Color hex (e.g. "#5e6ad2")' },
        isGroup: { type: 'boolean', description: 'Whether this label is a group label' },
        parentId: { type: 'string', description: 'Parent issue label UUID; set null through raw JSON to clear if Linear accepts it' },
        retiredAt: { type: 'string', description: 'Retirement timestamp; prefer issue_label_retire/issue_label_restore for normal lifecycle' },
        replaceTeamLabels: { type: 'boolean', description: 'Linear replaceTeamLabels flag; omit unless intentionally replacing team labels' },
      },
      required: ['id'],
    },
    examples: [
      {
        title: 'Rename/color',
        args: { workspace: 'personal', id: 'issue-label-uuid', name: 'Updated label', color: '#26b5ce' },
      },
    ],
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, id, replaceTeamLabels, ...input } = args
      const data = await client.query(UPDATE_ISSUE_LABEL_MUTATION, { id, input, replaceTeamLabels })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'list_project_labels',
    description: 'List project labels. Project labels are workspace-level; use filter for advanced ProjectLabelFilter queries.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        filter: { type: 'object', description: 'Raw ProjectLabelFilter object' },
        includeArchived: { type: 'boolean', description: 'Include archived/deleted labels (default: false)' },
        ...PAGINATION_PROPS,
      },
    },
    examples: [
      {
        title: 'Workspace project labels',
        args: { workspace: 'personal', first: 100 },
      },
    ],
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(LIST_PROJECT_LABELS_QUERY, {
        filter: args.filter as Record<string, unknown> | undefined,
        first: (args.first as number) || 100,
        after: args.after as string | undefined,
        includeArchived: (args.includeArchived as boolean) || false,
      })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'get_project_label',
    description: 'Get one project label by UUID with parent/child and retired/archive metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Project label UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(GET_PROJECT_LABEL_QUERY, { id: args.id })
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
    examples: [
      {
        title: 'Project label group',
        args: { workspace: 'personal', name: 'Linear MCP Sandbox', color: '#5e6ad2', isGroup: true },
      },
    ],
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, ...input } = args
      const data = await client.query(CREATE_PROJECT_LABEL_MUTATION, { input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'update_project_label',
    description: 'Update a project label name, description, color, parent, group flag, or retiredAt timestamp.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Project label UUID' },
        name: { type: 'string', description: 'New label name' },
        description: { type: 'string', description: 'New label description' },
        color: { type: 'string', description: 'Color hex (e.g. "#5e6ad2")' },
        isGroup: { type: 'boolean', description: 'Whether this label is a group label' },
        parentId: { type: 'string', description: 'Parent project label UUID; set null through raw JSON to clear if Linear accepts it' },
        retiredAt: { type: 'string', description: 'Retirement timestamp; prefer project_label_retire/project_label_restore for normal lifecycle' },
      },
      required: ['id'],
    },
    examples: [
      {
        title: 'Rename/color',
        args: { workspace: 'personal', id: 'project-label-uuid', name: 'Updated label', color: '#26b5ce' },
      },
    ],
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, id, ...input } = args
      const data = await client.query(UPDATE_PROJECT_LABEL_MUTATION, { id, input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'issue_label_retire',
    description: 'Retire an issue label so it stops appearing in pickers while preserving historical assignments. Reversible with issue_label_restore.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Label UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(ISSUE_LABEL_RETIRE_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'issue_label_restore',
    description: 'Restore a retired issue label.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Issue label UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(ISSUE_LABEL_RESTORE_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'delete_issue_label',
    description: 'Permanently delete an issue label. Use only for disposable test labels; prefer issue_label_retire for normal workspace cleanup.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Issue label UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(DELETE_ISSUE_LABEL_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'project_label_retire',
    description: 'Retire a project label so it stops appearing in pickers while preserving historical assignments. Reversible with project_label_restore.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Project label UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(PROJECT_LABEL_RETIRE_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'project_label_restore',
    description: 'Restore a retired project label.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Project label UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(PROJECT_LABEL_RESTORE_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'delete_project_label',
    description: 'Permanently delete a project label. Use only for disposable test labels; prefer project_label_retire for normal workspace cleanup.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Project label UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(DELETE_PROJECT_LABEL_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
]
