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

function parseTemplateData(td: unknown): Record<string, unknown> {
  if (!td) return {}
  if (typeof td === 'string') {
    const parsed = JSON.parse(td) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('templateData must parse to a JSON object')
    }
    return parsed as Record<string, unknown>
  }
  if (typeof td === 'object' && !Array.isArray(td)) return td as Record<string, unknown>
  throw new Error('templateData must be a JSON object or a JSON-encoded object string')
}

function validateRecurringTemplateData(td: unknown): Record<string, unknown> {
  const data = parseTemplateData(td)
  const schedule = data.schedule
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
    throw new Error('Recurring issue templateData must include schedule: { interval, type, startAt }')
  }
  const typedSchedule = schedule as Record<string, unknown>
  const interval = typedSchedule.interval
  const type = typedSchedule.type
  const startAt = typedSchedule.startAt
  if (!Number.isInteger(interval) || (interval as number) < 1) {
    throw new Error('Recurring issue schedule.interval must be a positive integer')
  }
  if (!['days', 'weeks', 'months', 'years'].includes(String(type))) {
    throw new Error('Recurring issue schedule.type must be one of: days, weeks, months, years')
  }
  if (typeof startAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startAt)) {
    throw new Error('Recurring issue schedule.startAt must be YYYY-MM-DD')
  }
  if (typeof data.title !== 'string' || data.title.trim() === '') {
    throw new Error('Recurring issue templateData.title is required')
  }
  return data
}

function compactObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined))
}

function recurringTemplateDataFromArgs(args: Record<string, unknown>, existing: Record<string, unknown> = {}): Record<string, unknown> {
  const existingSchedule = (existing.schedule && typeof existing.schedule === 'object' && !Array.isArray(existing.schedule))
    ? existing.schedule as Record<string, unknown>
    : {}
  const schedule = compactObject({
    interval: args.scheduleInterval ?? existingSchedule.interval,
    type: args.scheduleType ?? existingSchedule.type,
    startAt: args.startAt ?? existingSchedule.startAt,
  })
  return validateRecurringTemplateData(compactObject({
    ...existing,
    title: args.title ?? existing.title,
    description: args.issueDescription ?? existing.description,
    priority: args.priority ?? existing.priority,
    estimate: args.estimate ?? existing.estimate,
    assigneeId: args.assigneeId ?? existing.assigneeId,
    labelIds: args.labelIds ?? existing.labelIds,
    teamId: args.teamId ?? existing.teamId,
    projectId: args.projectId ?? existing.projectId,
    stateId: args.stateId ?? existing.stateId,
    dueDate: args.dueDate ?? existing.dueDate,
    schedule,
  }))
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
        icon: { type: 'string', description: 'Linear icon name (e.g. "Health")' },
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
      const templateObject = rest.type === 'recurringIssue' ? validateRecurringTemplateData(templateData) : templateData
      const serialized = serializeTemplateData(templateObject)
      if (serialized !== undefined) input.templateData = serialized
      const result = await client.query(CREATE_TEMPLATE_MUTATION, { input })
      return JSON.stringify(result, null, 2)
    },
  },
  {
    name: 'create_recurring_issue_template',
    description: 'Create a recurring issue template with validated schedule fields instead of fragile raw templateData JSON. Delete the template to stop future spawning; archive any already-created recurring issues separately.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Optional client-generated template UUID' },
        name: { type: 'string', description: 'Template name (required)' },
        teamId: { type: 'string', description: 'Team UUID (required for recurring issue templates)' },
        description: { type: 'string', description: 'Template description' },
        icon: { type: 'string', description: 'Linear icon name (e.g. "Health")' },
        color: { type: 'string', description: 'Color hex (e.g. "#5e6ad2")' },
        sortOrder: { type: 'number', description: 'Manual sort order' },
        title: { type: 'string', description: 'Issue title created by the recurring template (required)' },
        issueDescription: { type: 'string', description: 'Issue description created by the recurring template' },
        priority: { type: 'integer', description: 'Issue priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low' },
        estimate: { type: 'number', description: 'Issue estimate' },
        assigneeId: { type: 'string', description: 'Issue assignee user UUID' },
        labelIds: { type: 'array', items: { type: 'string' }, description: 'Issue label UUIDs' },
        projectId: { type: 'string', description: 'Issue project UUID' },
        stateId: { type: 'string', description: 'Issue workflow state UUID' },
        dueDate: { type: 'string', description: 'Issue due date (YYYY-MM-DD)' },
        scheduleInterval: { type: 'integer', description: 'Positive recurrence interval (required)' },
        scheduleType: { type: 'string', description: 'Recurrence type: days | weeks | months | years (required)' },
        startAt: { type: 'string', description: 'First recurrence date YYYY-MM-DD (required)' },
      },
      required: ['name', 'teamId', 'title', 'scheduleInterval', 'scheduleType', 'startAt'],
    },
    examples: [
      {
        title: 'Weekly recurring issue',
        description: 'Use a far-future startAt for fixtures, but still verify whether Linear created an initial issue and archive it separately.',
        args: {
          workspace: 'test',
          name: 'MCP Smoke Weekly Template',
          teamId: 'team-uuid',
          title: 'Weekly review',
          issueDescription: 'Recurring issue generated by Linear.',
          scheduleInterval: 1,
          scheduleType: 'weeks',
          startAt: '2026-12-31',
          icon: 'Health',
          color: '#5e6ad2',
        },
      },
    ],
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, title: _title, issueDescription: _issueDescription, scheduleInterval: _scheduleInterval, scheduleType: _scheduleType, startAt: _startAt, priority: _priority, estimate: _estimate, assigneeId: _assigneeId, labelIds: _labelIds, projectId: _projectId, stateId: _stateId, dueDate: _dueDate, ...rest } = args
      const templateData = recurringTemplateDataFromArgs(args)
      const input = { ...rest, type: 'recurringIssue', templateData: JSON.stringify(templateData) }
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
        icon: { type: 'string', description: 'New Linear icon name (e.g. "Health")' },
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
    name: 'update_recurring_issue_template',
    description: 'Update a recurring issue template with validated schedule fields. Reads the existing templateData, merges provided issue/schedule fields, and replaces templateData with a full valid recurringIssue payload.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Template UUID (required)' },
        name: { type: 'string', description: 'New template name' },
        teamId: { type: 'string', description: 'Team UUID' },
        description: { type: 'string', description: 'New template description' },
        icon: { type: 'string', description: 'New Linear icon name' },
        color: { type: 'string', description: 'New color hex' },
        sortOrder: { type: 'number', description: 'Manual sort order' },
        title: { type: 'string', description: 'Issue title created by the recurring template' },
        issueDescription: { type: 'string', description: 'Issue description created by the recurring template' },
        priority: { type: 'integer', description: 'Issue priority' },
        estimate: { type: 'number', description: 'Issue estimate' },
        assigneeId: { type: 'string', description: 'Issue assignee user UUID' },
        labelIds: { type: 'array', items: { type: 'string' }, description: 'Issue label UUIDs' },
        projectId: { type: 'string', description: 'Issue project UUID' },
        stateId: { type: 'string', description: 'Issue workflow state UUID' },
        dueDate: { type: 'string', description: 'Issue due date (YYYY-MM-DD)' },
        scheduleInterval: { type: 'integer', description: 'Positive recurrence interval' },
        scheduleType: { type: 'string', description: 'Recurrence type: days | weeks | months | years' },
        startAt: { type: 'string', description: 'First recurrence date YYYY-MM-DD' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const current = await client.query<{ template: { type: string; templateData: string } }>(GET_TEMPLATE_QUERY, { id: args.id })
      if (current.template.type !== 'recurringIssue') {
        throw new Error(`Template ${args.id} is type ${current.template.type}, not recurringIssue`)
      }
      const existing = validateRecurringTemplateData(current.template.templateData)
      const templateData = recurringTemplateDataFromArgs(args, existing)
      const { workspace: _, id, title: _title, issueDescription: _issueDescription, scheduleInterval: _scheduleInterval, scheduleType: _scheduleType, startAt: _startAt, priority: _priority, estimate: _estimate, assigneeId: _assigneeId, labelIds: _labelIds, projectId: _projectId, stateId: _stateId, dueDate: _dueDate, ...rest } = args
      const input = { ...rest, templateData: JSON.stringify(templateData) }
      const data = await client.query(UPDATE_TEMPLATE_MUTATION, { id, input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'delete_template',
    description: 'Hard-delete a template. Irreversible — use only for test/cleanup. To stop a recurring template from spawning future issues, delete it; archive any already-created issues separately.',
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
