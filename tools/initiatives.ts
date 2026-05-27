import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP, PAGINATION_PROPS } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'

const INITIATIVE_FIELDS = `
  id name description content status color icon archivedAt
  targetDate targetDateResolution
  owner { id name }
  createdAt updatedAt
`

const INITIATIVE_PROJECT_LINK_FIELDS = `
  id sortOrder archivedAt
  initiative { id name status color icon targetDate }
  project { id name state progress status { id name type color } }
`

const INITIATIVE_UPDATE_FIELDS = `
  id body health url archivedAt createdAt updatedAt user { id name }
`

const INITIATIVE_RELATION_FIELDS = `
  id sortOrder archivedAt createdAt updatedAt
  initiative { id name status }
  relatedInitiative { id name status }
  user { id name }
`

const LIST_INITIATIVES_QUERY = `
  query ListInitiatives($first: Int, $after: String) {
    initiatives(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id name description status color icon archivedAt
        targetDate targetDateResolution
        owner { id name }
        projects { nodes { id name state progress status { id name type color } } }
        createdAt updatedAt
      }
    }
  }
`

const GET_INITIATIVE_QUERY = `
  query GetInitiative($id: String!) {
    initiative(id: $id) {
      ${INITIATIVE_FIELDS}
      documentContent { id }
      projects { nodes { id name state progress status { id name type color } } }
      initiativeUpdates { nodes { ${INITIATIVE_UPDATE_FIELDS} } }
      relations { nodes { ${INITIATIVE_RELATION_FIELDS} } }
    }
  }
`

const GET_INITIATIVE_COMMENTS_QUERY = `
  query GetInitiativeComments($initiativeId: ID!) {
    comments(filter: { initiative: { id: { eq: $initiativeId } } }, first: 50) {
      nodes {
        id body quotedText url
        issueId projectId initiativeId documentContentId projectUpdateId initiativeUpdateId parentId
        user { name }
        createdAt updatedAt resolvedAt
      }
    }
  }
`

const LIST_INITIATIVE_PROJECT_LINKS_QUERY = `
  query ListInitiativeProjectLinks($first: Int, $after: String, $includeArchived: Boolean) {
    initiativeToProjects(first: $first, after: $after, includeArchived: $includeArchived) {
      pageInfo { hasNextPage endCursor }
      nodes { ${INITIATIVE_PROJECT_LINK_FIELDS} }
    }
  }
`

const CREATE_INITIATIVE_MUTATION = `
  mutation CreateInitiative($input: InitiativeCreateInput!) {
    initiativeCreate(input: $input) {
      success
      initiative { ${INITIATIVE_FIELDS} }
    }
  }
`

const UPDATE_INITIATIVE_MUTATION = `
  mutation UpdateInitiative($id: String!, $input: InitiativeUpdateInput!) {
    initiativeUpdate(id: $id, input: $input) {
      success
      initiative { ${INITIATIVE_FIELDS} }
    }
  }
`

const ARCHIVE_INITIATIVE_MUTATION = `
  mutation ArchiveInitiative($id: String!) {
    initiativeArchive(id: $id) {
      success
      entity { ${INITIATIVE_FIELDS} }
    }
  }
`

const UNARCHIVE_INITIATIVE_MUTATION = `
  mutation UnarchiveInitiative($id: String!) {
    initiativeUnarchive(id: $id) {
      success
      entity { ${INITIATIVE_FIELDS} }
    }
  }
`

const LINK_INITIATIVE_PROJECT_MUTATION = `
  mutation LinkInitiativeProject($input: InitiativeToProjectCreateInput!) {
    initiativeToProjectCreate(input: $input) {
      success
      initiativeToProject { ${INITIATIVE_PROJECT_LINK_FIELDS} }
    }
  }
`

const FIND_INITIATIVE_PROJECT_LINK_QUERY = `
  query FindInitiativeProjectLink($first: Int, $after: String) {
    initiativeToProjects(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id sortOrder initiative { id name } project { id name } }
    }
  }
`

const UPDATE_INITIATIVE_PROJECT_LINK_MUTATION = `
  mutation UpdateInitiativeProjectLink($id: String!, $input: InitiativeToProjectUpdateInput!) {
    initiativeToProjectUpdate(id: $id, input: $input) {
      success
      initiativeToProject { ${INITIATIVE_PROJECT_LINK_FIELDS} }
    }
  }
`

const UNLINK_INITIATIVE_PROJECT_MUTATION = `
  mutation UnlinkInitiativeProject($id: String!) {
    initiativeToProjectDelete(id: $id) { success }
  }
`

const CREATE_INITIATIVE_UPDATE_MUTATION = `
  mutation CreateInitiativeUpdate($input: InitiativeUpdateCreateInput!) {
    initiativeUpdateCreate(input: $input) {
      success
      initiativeUpdate { ${INITIATIVE_UPDATE_FIELDS} }
    }
  }
`

const UPDATE_INITIATIVE_UPDATE_MUTATION = `
  mutation UpdateInitiativeUpdate($id: String!, $input: InitiativeUpdateUpdateInput!) {
    initiativeUpdateUpdate(id: $id, input: $input) {
      success
      initiativeUpdate { ${INITIATIVE_UPDATE_FIELDS} }
    }
  }
`

const ARCHIVE_INITIATIVE_UPDATE_MUTATION = `
  mutation ArchiveInitiativeUpdate($id: String!) {
    initiativeUpdateArchive(id: $id) {
      success
      entity { ${INITIATIVE_UPDATE_FIELDS} }
    }
  }
`

const UNARCHIVE_INITIATIVE_UPDATE_MUTATION = `
  mutation UnarchiveInitiativeUpdate($id: String!) {
    initiativeUpdateUnarchive(id: $id) {
      success
      entity { ${INITIATIVE_UPDATE_FIELDS} }
    }
  }
`

const CREATE_INITIATIVE_RELATION_MUTATION = `
  mutation CreateInitiativeRelation($input: InitiativeRelationCreateInput!) {
    initiativeRelationCreate(input: $input) {
      success
      initiativeRelation { ${INITIATIVE_RELATION_FIELDS} }
    }
  }
`

const UPDATE_INITIATIVE_RELATION_MUTATION = `
  mutation UpdateInitiativeRelation($id: String!, $input: InitiativeRelationUpdateInput!) {
    initiativeRelationUpdate(id: $id, input: $input) {
      success
      initiativeRelation { ${INITIATIVE_RELATION_FIELDS} }
    }
  }
`

const DELETE_INITIATIVE_RELATION_MUTATION = `
  mutation DeleteInitiativeRelation($id: String!) {
    initiativeRelationDelete(id: $id) { success }
  }
`

const ADD_INITIATIVE_LABEL_MUTATION = `
  mutation AddInitiativeLabel($id: String!, $labelId: String!) {
    initiativeAddLabel(id: $id, labelId: $labelId) { success }
  }
`

const REMOVE_INITIATIVE_LABEL_MUTATION = `
  mutation RemoveInitiativeLabel($id: String!, $labelId: String!) {
    initiativeRemoveLabel(id: $id, labelId: $labelId) { success }
  }
`

const DELETE_INITIATIVE_MUTATION = `
  mutation DeleteInitiative($id: String!) {
    initiativeDelete(id: $id) {
      success
      entity { ${INITIATIVE_FIELDS} }
    }
  }
`

type InitiativeProjectLink = {
  id: string
  sortOrder?: string
  initiative: { id: string; name?: string }
  project: { id: string; name?: string }
}

async function listInitiativeProjectLinks(
  client: LinearClient,
  options: { initiativeId?: string; projectId?: string; includeArchived?: boolean; first?: number } = {},
): Promise<InitiativeProjectLink[]> {
  const matches: InitiativeProjectLink[] = []
  let after: string | undefined
  do {
    const data = await client.query<{
      initiativeToProjects: {
        pageInfo: { hasNextPage: boolean; endCursor?: string | null }
        nodes: InitiativeProjectLink[]
      }
    }>(LIST_INITIATIVE_PROJECT_LINKS_QUERY, {
      first: 250,
      after,
      includeArchived: options.includeArchived ?? false,
    })
    for (const link of data.initiativeToProjects.nodes) {
      if (options.initiativeId && link.initiative.id !== options.initiativeId) continue
      if (options.projectId && link.project.id !== options.projectId) continue
      matches.push(link)
      if (options.first && matches.length >= options.first) return matches
    }
    after = data.initiativeToProjects.pageInfo.hasNextPage
      ? data.initiativeToProjects.pageInfo.endCursor ?? undefined
      : undefined
  } while (after)
  return matches
}

async function findInitiativeProjectLink(
  client: LinearClient,
  initiativeId: unknown,
  projectId: unknown,
): Promise<InitiativeProjectLink | undefined> {
  if (typeof initiativeId !== 'string' || typeof projectId !== 'string') return undefined
  const matches = await listInitiativeProjectLinks(client, { initiativeId, projectId, first: 1 })
  return matches[0]
}

export const initiativeTools: ToolDef[] = [
  {
    name: 'list_initiatives',
    description: 'List all initiatives in the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        ...PAGINATION_PROPS,
      },
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(LIST_INITIATIVES_QUERY, {
        first: (args.first as number) || 50,
        after: args.after as string | undefined,
      })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'get_initiative',
    description: 'Get a single initiative by ID with content, direct comments, linked projects, and updates.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Initiative UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query<{ initiative: { comments?: unknown } }>(GET_INITIATIVE_QUERY, { id: args.id })
      const comments = await client.query(GET_INITIATIVE_COMMENTS_QUERY, { initiativeId: args.id })
      data.initiative.comments = (comments as { comments: unknown }).comments
      ;(data.initiative as { initiativeToProjects?: { nodes: InitiativeProjectLink[] } }).initiativeToProjects = {
        nodes: await listInitiativeProjectLinks(client, { initiativeId: args.id as string }),
      }
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'list_initiative_project_links',
    description: 'List initiative-project link records. Optional client-side filters support initiativeId and projectId.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        initiativeId: { type: 'string', description: 'Filter by initiative UUID' },
        projectId: { type: 'string', description: 'Filter by project UUID' },
        includeArchived: { type: 'boolean', description: 'Include archived link records (default: false)' },
        first: { type: 'integer', description: 'Maximum matching links to return' },
      },
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const nodes = await listInitiativeProjectLinks(client, {
        initiativeId: args.initiativeId as string | undefined,
        projectId: args.projectId as string | undefined,
        includeArchived: args.includeArchived as boolean | undefined,
        first: args.first as number | undefined,
      })
      return JSON.stringify({ initiativeToProjects: { nodes } }, null, 2)
    },
  },
  {
    name: 'create_initiative',
    description: 'Create a new initiative.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Optional client-generated initiative UUID' },
        name: { type: 'string', description: 'Initiative name (required)' },
        description: { type: 'string', description: 'Short initiative description' },
        content: { type: 'string', description: 'Rich initiative content/body (markdown)' },
        status: { type: 'string', description: 'Status: Planned, Active, or Completed' },
        ownerId: { type: 'string', description: 'Owner user UUID' },
        color: { type: 'string', description: 'Color hex (e.g. "#5e6ad2")' },
        icon: { type: 'string', description: 'Initiative icon (:emoji_name: format)' },
        targetDate: { type: 'string', description: 'Target date (YYYY-MM-DD)' },
        targetDateResolution: { type: 'string', description: 'Date resolution for targetDate (e.g. day, month, quarter, year)' },
        sortOrder: { type: 'number', description: 'Manual sort order' },
        labelIds: { type: 'array', items: { type: 'string' }, description: 'Initiative label UUIDs' },
      },
      required: ['name'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, ...input } = args
      const data = await client.query(CREATE_INITIATIVE_MUTATION, { input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'update_initiative',
    description: 'Update an existing initiative.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Initiative UUID' },
        name: { type: 'string', description: 'New name' },
        description: { type: 'string', description: 'Short summary (max 255 chars)' },
        content: { type: 'string', description: 'Rich body/description (markdown, no length limit)' },
        status: { type: 'string', description: 'Status: Planned, Active, or Completed' },
        ownerId: { type: 'string', description: 'Owner user UUID' },
        color: { type: 'string', description: 'Color hex' },
        icon: { type: 'string', description: 'Initiative icon (:emoji_name: format)' },
        targetDate: { type: 'string', description: 'Target date (YYYY-MM-DD)' },
        targetDateResolution: { type: 'string', description: 'Date resolution for targetDate (e.g. day, month, quarter, year)' },
        sortOrder: { type: 'number', description: 'Manual sort order' },
        labelIds: { type: 'array', items: { type: 'string' }, description: 'Initiative label UUIDs' },
        updateReminderFrequencyInWeeks: { type: 'number', description: 'Legacy reminder frequency in weeks' },
        updateReminderFrequency: { type: 'number', description: 'Reminder frequency value' },
        frequencyResolution: { type: 'string', description: 'Reminder frequency resolution' },
        updateRemindersDay: { type: 'string', description: 'Reminder day' },
        updateRemindersHour: { type: 'integer', description: 'Reminder hour' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, id, ...input } = args
      const data = await client.query(UPDATE_INITIATIVE_MUTATION, { id, input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'archive_initiative',
    description: 'Archive an initiative. Reversible via unarchive_initiative.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Initiative UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(ARCHIVE_INITIATIVE_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'unarchive_initiative',
    description: 'Restore an archived initiative.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Initiative UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(UNARCHIVE_INITIATIVE_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'link_initiative_project',
    description: 'Link a project to an initiative.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        initiativeId: { type: 'string', description: 'Initiative UUID' },
        projectId: { type: 'string', description: 'Project UUID' },
        sortOrder: { type: 'number', description: 'Manual sort order for the project within the initiative' },
      },
      required: ['initiativeId', 'projectId'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(LINK_INITIATIVE_PROJECT_MUTATION, {
        input: {
          initiativeId: args.initiativeId,
          projectId: args.projectId,
          sortOrder: args.sortOrder,
        },
      })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'update_initiative_project_link',
    description: 'Update an initiative-project link record, currently used for sortOrder.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        linkId: { type: 'string', description: 'InitiativeToProject record UUID (direct path)' },
        initiativeId: { type: 'string', description: 'Initiative UUID (used with projectId for lookup)' },
        projectId: { type: 'string', description: 'Project UUID (used with initiativeId for lookup)' },
        sortOrder: { type: 'number', description: 'Manual sort order for the project within the initiative' },
      },
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      let linkId = args.linkId as string | undefined
      if (!linkId) {
        const match = await findInitiativeProjectLink(client, args.initiativeId, args.projectId)
        if (!match) {
          throw new Error(`No link found between initiative ${args.initiativeId} and project ${args.projectId}`)
        }
        linkId = match.id
      }
      const data = await client.query(UPDATE_INITIATIVE_PROJECT_LINK_MUTATION, {
        id: linkId,
        input: { sortOrder: args.sortOrder },
      })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'unlink_initiative_project',
    description: 'Unlink a project from an initiative. Accepts EITHER `linkId` (the InitiativeToProject record UUID) directly, OR `initiativeId` + `projectId` (looks up the link automatically). Use the latter when you don\'t have the link ID handy.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        linkId: { type: 'string', description: 'InitiativeToProject record UUID (direct path)' },
        initiativeId: { type: 'string', description: 'Initiative UUID (used with projectId for lookup)' },
        projectId: { type: 'string', description: 'Project UUID (used with initiativeId for lookup)' },
      },
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      let linkId = args.linkId as string | undefined
      if (!linkId) {
        if (!args.initiativeId || !args.projectId) {
          throw new Error('Must provide either linkId, or both initiativeId and projectId')
        }
        const match = await findInitiativeProjectLink(client, args.initiativeId, args.projectId)
        if (!match) {
          throw new Error(`No link found between initiative ${args.initiativeId} and project ${args.projectId}`)
        }
        linkId = match.id
      }
      const data = await client.query(UNLINK_INITIATIVE_PROJECT_MUTATION, { id: linkId })
      return JSON.stringify({ ...(data as object), unlinkedLinkId: linkId }, null, 2)
    },
  },
  {
    name: 'create_initiative_update',
    description: 'Post a status update on an initiative with health indicator.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        initiativeId: { type: 'string', description: 'Initiative UUID (required)' },
        body: { type: 'string', description: 'Update body (markdown)' },
        health: { type: 'string', description: 'Health: onTrack, atRisk, or offTrack' },
      },
      required: ['initiativeId'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, ...input } = args
      const data = await client.query(CREATE_INITIATIVE_UPDATE_MUTATION, { input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'update_initiative_update',
    description: 'Edit an initiative status update body and/or health.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Initiative update UUID' },
        body: { type: 'string', description: 'Updated markdown body' },
        bodyData: { description: 'Updated rich body JSON, when available' },
        health: { type: 'string', description: 'Health: onTrack, atRisk, or offTrack' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, id, ...input } = args
      const data = await client.query(UPDATE_INITIATIVE_UPDATE_MUTATION, { id, input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'archive_initiative_update',
    description: 'Archive an initiative status update.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Initiative update UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(ARCHIVE_INITIATIVE_UPDATE_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'unarchive_initiative_update',
    description: 'Restore an archived initiative status update.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Initiative update UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(UNARCHIVE_INITIATIVE_UPDATE_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'create_initiative_relation',
    description: 'Create an initiative relation/sub-initiative link. This may be Enterprise-gated in Linear.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Optional client-generated initiative relation UUID' },
        initiativeId: { type: 'string', description: 'Parent/source initiative UUID' },
        relatedInitiativeId: { type: 'string', description: 'Related/sub initiative UUID' },
        sortOrder: { type: 'number', description: 'Manual sort order' },
      },
      required: ['initiativeId', 'relatedInitiativeId'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, ...input } = args
      const data = await client.query(CREATE_INITIATIVE_RELATION_MUTATION, { input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'update_initiative_relation',
    description: 'Update an initiative relation sort order. This may be Enterprise-gated in Linear.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Initiative relation UUID' },
        sortOrder: { type: 'number', description: 'Manual sort order' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, id, ...input } = args
      const data = await client.query(UPDATE_INITIATIVE_RELATION_MUTATION, { id, input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'delete_initiative_relation',
    description: 'Delete an initiative relation. This may be Enterprise-gated in Linear.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Initiative relation UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(DELETE_INITIATIVE_RELATION_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'add_initiative_label',
    description: 'Attach an initiative label to an initiative. This may be feature-gated in Linear.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Initiative UUID' },
        labelId: { type: 'string', description: 'Initiative label UUID' },
      },
      required: ['id', 'labelId'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(ADD_INITIATIVE_LABEL_MUTATION, { id: args.id, labelId: args.labelId })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'remove_initiative_label',
    description: 'Remove an initiative label from an initiative. This may be feature-gated in Linear.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Initiative UUID' },
        labelId: { type: 'string', description: 'Initiative label UUID' },
      },
      required: ['id', 'labelId'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(REMOVE_INITIATIVE_LABEL_MUTATION, { id: args.id, labelId: args.labelId })
      return JSON.stringify(data, null, 2)
    },
  },
]
