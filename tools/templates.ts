import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'

const TEMPLATE_FIELDS = `
  id name description type icon color templateData sortOrder archivedAt lastAppliedAt hasFormFields
  team { id name key }
  organization { id name }
  creator { id name }
  lastUpdatedBy { id name }
  inheritedFrom { id name type }
  createdAt updatedAt
`

const LIST_TEAM_TEMPLATES_QUERY = `
  query ListTeamTemplates($teamId: String!) {
    team(id: $teamId) {
      templates { nodes { ${TEMPLATE_FIELDS} } }
    }
  }
`

const LIST_WORKSPACE_TEMPLATES_QUERY = `
  query ListWorkspaceTemplates {
    templates { ${TEMPLATE_FIELDS} }
  }
`

const GET_TEMPLATE_QUERY = `
  query GetTemplate($id: String!) {
    template(id: $id) { ${TEMPLATE_FIELDS} }
  }
`

const CREATE_TEMPLATE_MUTATION = `
  mutation CreateTemplate($input: TemplateCreateInput!) {
    templateCreate(input: $input) {
      success
      template { ${TEMPLATE_FIELDS} }
    }
  }
`

const UPDATE_TEMPLATE_MUTATION = `
  mutation UpdateTemplate($id: String!, $input: TemplateUpdateInput!) {
    templateUpdate(id: $id, input: $input) {
      success
      template { ${TEMPLATE_FIELDS} }
    }
  }
`

const DELETE_TEMPLATE_MUTATION = `
  mutation DeleteTemplate($id: String!) {
    templateDelete(id: $id) { success }
  }
`

function serializeTemplateData(td: unknown): string | undefined {
  if (td == null) return undefined
  if (typeof td === 'string') return td
  return JSON.stringify(td)
}

export const templateTools: ToolDef[] = [
  {
    name: 'list_templates',
    description: 'List workspace templates, or team templates when teamId is provided. Templates have types: issue, project, recurringIssue, document, releaseNote. The templateData JSON field carries entity-specific config; for recurringIssue type it includes `schedule: {interval, type, startAt}` where type is "days" | "weeks" | "months" | "years".',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        teamId: { type: 'string', description: 'Optional team UUID. Omit for workspace-level templates.' },
      },
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = args.teamId
        ? await client.query(LIST_TEAM_TEMPLATES_QUERY, { teamId: args.teamId })
        : await client.query(LIST_WORKSPACE_TEMPLATES_QUERY)
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'get_template',
    description: 'Get a single template by UUID. Returns templateData as a JSON-encoded string — parse client-side.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Template UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(GET_TEMPLATE_QUERY, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'create_template',
    description: 'Create a template. For recurringIssue type, templateData MUST include a schedule object — Linear rejects with "The recurring issue template must have a schedule." Schedule shape: {interval: 1, type: "days"|"weeks"|"months"|"years", startAt: "YYYY-MM-DD"}. templateData accepts either a JSON-encoded string or a plain object (auto-stringified).',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Optional client-generated template UUID' },
        name: { type: 'string', description: 'Template name (required)' },
        type: { type: 'string', description: 'Template type: issue | project | recurringIssue | document | releaseNote' },
        teamId: { type: 'string', description: 'Team UUID (omit for org-wide template — most types require teamId)' },
        description: { type: 'string', description: 'Template description' },
        icon: { type: 'string', description: 'Template icon (:emoji_name: format)' },
        color: { type: 'string', description: 'Color hex (e.g. "#5e6ad2")' },
        sortOrder: { type: 'number', description: 'Manual sort order' },
        templateData: {
          description: 'Entity-specific config. Either a JSON-encoded string or a plain object. For recurringIssue, MUST include schedule: { interval, type, startAt }.',
        },
      },
      required: ['name', 'type', 'templateData'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, templateData, ...rest } = args
      const input: Record<string, unknown> = { ...rest }
      const serialized = serializeTemplateData(templateData)
      if (serialized !== undefined) input.templateData = serialized
      const data = await client.query(CREATE_TEMPLATE_MUTATION, { input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'update_template',
    description: 'Update an existing template. Pass changed fields only. templateData replaces entirely (no merge).',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Template UUID (required)' },
        name: { type: 'string', description: 'New name' },
        description: { type: 'string', description: 'New description' },
        icon: { type: 'string', description: 'New icon (:emoji_name: format)' },
        color: { type: 'string', description: 'New color hex' },
        teamId: { type: 'string', description: 'Move/scope template to team UUID' },
        sortOrder: { type: 'number', description: 'Manual sort order' },
        templateData: { description: 'New templateData (object or JSON string)' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, id, templateData, ...rest } = args
      const input: Record<string, unknown> = { ...rest }
      const serialized = serializeTemplateData(templateData)
      if (serialized !== undefined) input.templateData = serialized
      const data = await client.query(UPDATE_TEMPLATE_MUTATION, { id, input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'delete_template',
    description: 'Hard-delete a template. Irreversible — use only for test/cleanup. To stop a recurring template from spawning, delete it (or update its schedule to a far-future date).',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Template UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(DELETE_TEMPLATE_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
]
