import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP, PAGINATION_PROPS } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'
import { COMMENT_READ_FIELDS } from './commentRead.js'

const CREATE_DOCUMENT_MUTATION = `
  mutation CreateDocument($input: DocumentCreateInput!) {
    documentCreate(input: $input) {
      success
      document {
        id title icon color url documentContentId contentState
        project { id name }
        initiative { id name }
      }
    }
  }
`

const UPDATE_DOCUMENT_MUTATION = `
  mutation UpdateDocument($id: String!, $input: DocumentUpdateInput!) {
    documentUpdate(id: $id, input: $input) {
      success
      document { id title icon color url documentContentId contentState }
    }
  }
`

const GET_DOCUMENT_QUERY = `
  query GetDocument($id: String!) {
    document(id: $id) {
      id title icon color url content documentContentId contentState
      project { id name }
      initiative { id name }
      creator { name }
      createdAt updatedAt
    }
  }
`

const GET_DOCUMENT_COMMENTS_QUERY = `
  query GetDocumentComments($documentContentId: ID!) {
    comments(filter: { documentContent: { id: { eq: $documentContentId } } }, first: 25) {
      nodes {
        ${COMMENT_READ_FIELDS}
      }
    }
  }
`

const SEARCH_DOCUMENTS_QUERY = `
  query SearchDocuments($filter: DocumentFilter, $first: Int, $after: String) {
    documents(filter: $filter, first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id title icon color url documentContentId
        project { id name }
        initiative { id name }
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

export const documentTools: ToolDef[] = [
  {
    name: 'create_document',
    description: 'Create a document. Link to a project, initiative, or team.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        title: { type: 'string', description: 'Document title (required)' },
        content: { type: 'string', description: 'Document body (markdown)' },
        icon: { type: 'string', description: 'Linear icon name (e.g. "Health")' },
        color: { type: 'string', description: 'Color hex (e.g. "#5e6ad2")' },
        projectId: { type: 'string', description: 'Link to project UUID' },
        initiativeId: { type: 'string', description: 'Link to initiative UUID' },
        teamId: { type: 'string', description: 'Link to team UUID' },
      },
      required: ['title'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, ...input } = args
      const data = await client.query(CREATE_DOCUMENT_MUTATION, { input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'update_document',
    description: 'Update a document title, content, icon, or color.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Document UUID (required)' },
        title: { type: 'string', description: 'New title' },
        content: { type: 'string', description: 'New content (markdown)' },
        icon: { type: 'string', description: 'New Linear icon name (e.g. "Health")' },
        color: { type: 'string', description: 'New color hex' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, id, ...input } = args
      const data = await client.query(UPDATE_DOCUMENT_MUTATION, { id, input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'get_document',
    description: 'Get a document by UUID, including full markdown content.',
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
      const data = await client.query<{ document: { documentContentId?: string | null; comments?: unknown } }>(
        GET_DOCUMENT_QUERY,
        { id: args.id },
      )
      if (data.document.documentContentId) {
        const comments = await client.query(GET_DOCUMENT_COMMENTS_QUERY, {
          documentContentId: data.document.documentContentId,
        })
        data.document.comments = (comments as { comments: unknown }).comments
      }
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'search_documents',
    description: 'Search and list documents. Optionally filter by project or initiative.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        projectId: { type: 'string', description: 'Filter by project UUID' },
        initiativeId: { type: 'string', description: 'Filter by initiative UUID' },
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
        if (args.projectId) filter.project = { id: { eq: args.projectId } }
        if (args.initiativeId) filter.initiative = { id: { eq: args.initiativeId } }
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
