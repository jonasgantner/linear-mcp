import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP, PAGINATION_PROPS } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'
import { DEFAULT_EMBEDDED_COMMENT_LIMIT, listFullComments, resolveIssueId } from './commentRead.js'
import { extractFileAssets, type FileAsset } from './fileAssets.js'
import {
  LINEAR_VISUAL_COLOR_DESCRIPTION,
  LINEAR_VISUAL_ICON_DESCRIPTION,
  assertValidVisualMetadataInput,
} from './visualMetadata.js'

export const DOCUMENT_PARENT_FIELDS = `
  issue { id identifier title url }
  project { id name url }
  initiative { id name url }
  team { id name key }
`

export const DOCUMENT_SUMMARY_FIELDS = `
  id title icon color url documentContentId
  ${DOCUMENT_PARENT_FIELDS}
`

export const DOCUMENT_FULL_FIELDS = `
  ${DOCUMENT_SUMMARY_FIELDS}
  content contentState
`

const CREATE_DOCUMENT_MUTATION = `
  mutation CreateDocument($input: DocumentCreateInput!) {
    documentCreate(input: $input) {
      success
      document {
        ${DOCUMENT_FULL_FIELDS}
      }
    }
  }
`

const UPDATE_DOCUMENT_MUTATION = `
  mutation UpdateDocument($id: String!, $input: DocumentUpdateInput!) {
    documentUpdate(id: $id, input: $input) {
      success
      document { ${DOCUMENT_FULL_FIELDS} }
    }
  }
`

const GET_DOCUMENT_QUERY = `
  query GetDocument($id: String!) {
    document(id: $id) {
      ${DOCUMENT_FULL_FIELDS}
      creator { name }
      createdAt updatedAt
    }
  }
`

const SEARCH_DOCUMENTS_QUERY = `
  query SearchDocuments($filter: DocumentFilter, $first: Int, $after: String) {
    documents(filter: $filter, first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        ${DOCUMENT_SUMMARY_FIELDS}
        creator { name }
        createdAt updatedAt
      }
    }
  }
`

const DELETE_DOCUMENT_MUTATION = `
  mutation DeleteDocument($id: String!) {
    documentDelete(id: $id) { success }
  }
`

const SCHEMA_TYPE_QUERY = `
  query SchemaType($name: String!) {
    __type(name: $name) {
      fields { name }
      inputFields { name }
    }
  }
`

const DOCUMENT_SCHEMA_EXPECTED: Record<string, string[]> = {
  DocumentCreateInput: [
    'title',
    'content',
    'icon',
    'color',
    'issueId',
    'projectId',
    'initiativeId',
    'teamId',
  ],
  DocumentUpdateInput: [
    'title',
    'content',
    'icon',
    'color',
    'issueId',
    'projectId',
    'initiativeId',
    'teamId',
  ],
  DocumentFilter: [
    'id',
    'title',
    'issue',
    'project',
    'initiative',
    'team',
    'and',
    'or',
  ],
  Document: [
    'id',
    'title',
    'content',
    'documentContentId',
    'url',
    'issue',
    'project',
    'initiative',
    'team',
  ],
}

async function checkDocumentSchemaDrift(client: LinearClient): Promise<Record<string, unknown>> {
  const checked: Record<string, { expected: string[]; actual: string[]; missing: string[] }> = {}
  const missingMessages: string[] = []

  for (const [typeName, expected] of Object.entries(DOCUMENT_SCHEMA_EXPECTED)) {
    const data = await client.query<{
      __type: { fields?: Array<{ name: string }> | null; inputFields?: Array<{ name: string }> | null } | null
    }>(SCHEMA_TYPE_QUERY, { name: typeName })
    const actual = (data.__type?.fields ?? data.__type?.inputFields ?? []).map(field => field.name).sort()
    const missing = expected.filter(field => !actual.includes(field))
    checked[typeName] = { expected, actual, missing }
    for (const field of missing) missingMessages.push(`${typeName}.${field}`)
  }

  if (missingMessages.length > 0) {
    throw new Error(`Linear document schema drift: missing required field(s): ${missingMessages.join(', ')}`)
  }

  return { ok: true, checkedTypes: Object.keys(DOCUMENT_SCHEMA_EXPECTED), checked }
}

async function buildDocumentInput(
  client: LinearClient,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const input = { ...args }
  assertValidVisualMetadataInput(input)
  if (input.issueId) input.issueId = await resolveIssueId(client, input.issueId)
  return input
}

export const documentTools: ToolDef[] = [
  {
    name: 'create_document',
    description: 'Create a document. Link to an issue, project, initiative, or team by passing the matching parent ID.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        title: { type: 'string', description: 'Document title (required)' },
        content: { type: 'string', description: 'Document body (markdown)' },
        icon: { type: 'string', description: LINEAR_VISUAL_ICON_DESCRIPTION },
        color: { type: 'string', description: LINEAR_VISUAL_COLOR_DESCRIPTION },
        issueId: { type: 'string', description: 'Link to issue UUID or identifier (e.g. "J-123")' },
        projectId: { type: 'string', description: 'Link to project UUID' },
        initiativeId: { type: 'string', description: 'Link to initiative UUID' },
        teamId: { type: 'string', description: 'Link to team UUID' },
      },
      required: ['title'],
    },
    examples: [
      {
        title: 'Issue document',
        args: { workspace: 'personal', issueId: 'J-559', title: 'Decision log', content: '# Decision log\n\n...' },
      },
      {
        title: 'Team document',
        args: { workspace: 'test', teamId: 'team-uuid', title: 'Team runbook', content: 'Runbook body.' },
      },
    ],
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, ...rawInput } = args
      const input = await buildDocumentInput(client, rawInput)
      const data = await client.query(CREATE_DOCUMENT_MUTATION, { input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'update_document',
    description: 'Update a document title, content, icon, color, or parent association.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Document UUID (required)' },
        title: { type: 'string', description: 'New title' },
        content: { type: 'string', description: 'New content (markdown)' },
        icon: { type: 'string', description: LINEAR_VISUAL_ICON_DESCRIPTION },
        color: { type: 'string', description: LINEAR_VISUAL_COLOR_DESCRIPTION },
        issueId: { type: 'string', description: 'Move document to issue UUID or identifier (e.g. "J-123")' },
        projectId: { type: 'string', description: 'Move document to project UUID' },
        initiativeId: { type: 'string', description: 'Move document to initiative UUID' },
        teamId: { type: 'string', description: 'Move document to team UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, id, ...rawInput } = args
      const input = await buildDocumentInput(client, rawInput)
      const data = await client.query(UPDATE_DOCUMENT_MUTATION, { id, input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'get_document',
    description: 'Get a document by UUID, including full markdown content, structured content assets, and full comment metadata/assets.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Document UUID (required)' },
        commentsFirst: { type: 'integer', description: 'Requested total comments to return. Default 100, maximum 250; the MCP internally chunks Linear requests.' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query<{
        document: {
          content?: string | null
          contentAssets?: FileAsset[]
          documentContentId?: string | null
          comments?: unknown
        }
      }>(
        GET_DOCUMENT_QUERY,
        { id: args.id },
      )
      data.document.contentAssets = extractFileAssets(data.document.content)
      if (data.document.documentContentId) {
        const comments = await listFullComments(client, {
          filter: { documentContent: { id: { eq: data.document.documentContentId } } },
          first: (args.commentsFirst as number | undefined) ?? DEFAULT_EMBEDDED_COMMENT_LIMIT,
        }, DEFAULT_EMBEDDED_COMMENT_LIMIT)
        data.document.comments = comments.comments
      }
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'search_documents',
    description: 'Search and list documents. Optionally filter by issue, project, initiative, or team.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        issueId: { type: 'string', description: 'Filter by issue UUID or identifier (e.g. "J-123")' },
        projectId: { type: 'string', description: 'Filter by project UUID' },
        initiativeId: { type: 'string', description: 'Filter by initiative UUID' },
        teamId: { type: 'string', description: 'Filter by team UUID' },
        filter: { type: 'object', description: 'Raw DocumentFilter object' },
        ...PAGINATION_PROPS,
      },
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      let filter = args.filter as Record<string, unknown> | undefined
      if (!filter) {
        filter = {}
        if (args.issueId) filter.issue = { id: { eq: await resolveIssueId(client, args.issueId) } }
        if (args.projectId) filter.project = { id: { eq: args.projectId } }
        if (args.initiativeId) filter.initiative = { id: { eq: args.initiativeId } }
        if (args.teamId) filter.team = { id: { eq: args.teamId } }
      }
      const variables: Record<string, unknown> = {
        filter: filter && Object.keys(filter).length > 0 ? filter : undefined,
        first: (args.first as number) || 50,
        after: args.after as string | undefined,
      }
      const data = await client.query(SEARCH_DOCUMENTS_QUERY, variables)
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'check_document_schema_drift',
    description: 'Check the live Linear GraphQL schema for document create/update inputs, parent fields, and filters used by the MCP.',
    sideEffect: 'read',
    inputSchema: {
      type: 'object',
      properties: { ...WORKSPACE_PROP },
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await checkDocumentSchemaDrift(client)
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'delete_document',
    description: 'Delete a document.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Document UUID (required)' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(DELETE_DOCUMENT_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
]
