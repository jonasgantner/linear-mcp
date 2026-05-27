import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'
import { COMMENT_TARGET_PROPS, buildCommentCreateInput } from './commentTargets.js'
import { prepareInlineAnchor } from './inlineAnchors.js'
import { COMMENT_READ_FIELDS, buildCommentFilter } from './commentRead.js'

const GET_COMMENT_QUERY = `
  query GetComment($id: String!) {
    comment(id: $id) {
      ${COMMENT_READ_FIELDS}
    }
  }
`

const LIST_COMMENTS_QUERY = `
  query ListComments($filter: CommentFilter, $first: Int, $after: String, $includeArchived: Boolean, $orderBy: PaginationOrderBy) {
    comments(filter: $filter, first: $first, after: $after, includeArchived: $includeArchived, orderBy: $orderBy) {
      pageInfo { hasNextPage endCursor }
      nodes {
        ${COMMENT_READ_FIELDS}
      }
    }
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

const COMMENT_SCHEMA_EXPECTED: Record<string, string[]> = {
  Comment: [
    'id',
    'body',
    'quotedText',
    'url',
    'issueId',
    'projectId',
    'initiativeId',
    'documentContentId',
    'projectUpdateId',
    'initiativeUpdateId',
    'parentId',
    'children',
    'parent',
    'resolvedAt',
    'resolvingUser',
  ],
  CommentFilter: [
    'id',
    'body',
    'issue',
    'projectUpdate',
    'parent',
    'documentContent',
    'project',
    'initiative',
    'and',
    'or',
  ],
  CommentCreateInput: [
    'body',
    'issueId',
    'projectUpdateId',
    'initiativeUpdateId',
    'postId',
    'documentContentId',
    'projectId',
    'initiativeId',
    'parentId',
    'quotedText',
  ],
  CommentUpdateInput: ['body', 'bodyData', 'resolvingUserId', 'resolvingCommentId', 'quotedText'],
}

async function checkCommentSchemaDrift(client: LinearClient): Promise<Record<string, unknown>> {
  const checked: Record<string, { expected: string[]; actual: string[]; missing: string[] }> = {}
  const missingMessages: string[] = []

  for (const [typeName, expected] of Object.entries(COMMENT_SCHEMA_EXPECTED)) {
    const data = await client.query<{
      __type: { fields?: Array<{ name: string }> | null; inputFields?: Array<{ name: string }> | null } | null
    }>(SCHEMA_TYPE_QUERY, { name: typeName })
    const actual = (data.__type?.fields ?? data.__type?.inputFields ?? []).map(field => field.name).sort()
    const missing = expected.filter(field => !actual.includes(field))
    checked[typeName] = { expected, actual, missing }
    for (const field of missing) missingMessages.push(`${typeName}.${field}`)
  }

  if (missingMessages.length > 0) {
    throw new Error(`Linear comment schema drift: missing required field(s): ${missingMessages.join(', ')}`)
  }

  return { ok: true, checkedTypes: Object.keys(COMMENT_SCHEMA_EXPECTED), checked }
}

const CREATE_COMMENT_MUTATION = `
  mutation CreateComment($input: CommentCreateInput!) {
    commentCreate(input: $input) {
      success
      comment {
        id body quotedText url
        issueId projectId initiativeId documentContentId projectUpdateId initiativeUpdateId parentId
        user { name }
        createdAt
      }
    }
  }
`

const UPDATE_COMMENT_MUTATION = `
  mutation UpdateComment($id: String!, $input: CommentUpdateInput!) {
    commentUpdate(id: $id, input: $input) {
      success
      comment { id body user { name } updatedAt }
    }
  }
`

const DELETE_COMMENT_MUTATION = `
  mutation DeleteComment($id: String!) {
    commentDelete(id: $id) { success }
  }
`

const RESOLVE_COMMENT_MUTATION = `
  mutation ResolveComment($id: String!) {
    commentResolve(id: $id) {
      success
      comment { id resolvedAt resolvingUser { name } }
    }
  }
`

const UNRESOLVE_COMMENT_MUTATION = `
  mutation UnresolveComment($id: String!) {
    commentUnresolve(id: $id) {
      success
      comment { id }
    }
  }
`

export const commentTools: ToolDef[] = [
  {
    name: 'get_comment',
    description: 'Get one comment by UUID with parent, child replies, resolver metadata, target IDs, and source quote details.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Comment UUID' },
      },
      required: ['id'],
    },
    examples: [
      {
        title: 'Inspect resolved inline comment',
        args: { workspace: 'personal', id: 'comment-uuid' },
      },
    ],
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(GET_COMMENT_QUERY, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'list_comments',
    description: 'List comments with full thread readback. Filter by issueId, issueDescriptionId, documentId, documentContentId, projectId, initiativeId, projectUpdateId, parentId, projectContentId, initiativeContentId, query, or raw CommentFilter.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        issueId: { type: 'string', description: 'Issue UUID or identifier for normal issue comments' },
        issueDescriptionId: { type: 'string', description: 'Issue UUID or identifier for inline/source comments on the issue description' },
        documentId: { type: 'string', description: 'Document UUID for document body comments' },
        documentContentId: { type: 'string', description: 'DocumentContent UUID for content comments' },
        projectId: { type: 'string', description: 'Project UUID for direct project comments' },
        initiativeId: { type: 'string', description: 'Initiative UUID for direct initiative comments' },
        projectUpdateId: { type: 'string', description: 'Project update UUID for update comments' },
        parentId: { type: 'string', description: 'Parent comment UUID to list replies' },
        projectContentId: { type: 'string', description: 'Project UUID for comments on project rich content' },
        initiativeContentId: { type: 'string', description: 'Initiative UUID for comments on initiative rich content' },
        query: { type: 'string', description: 'Case-insensitive body search' },
        filter: { type: 'object', description: 'Raw CommentFilter object. Overrides convenience filters.' },
        first: { type: 'integer', maximum: 25, description: 'Number of comments to return per page. Default 25; use pagination for more.' },
        after: { type: 'string', description: 'Cursor for next page' },
        includeArchived: { type: 'boolean', description: 'Include archived/deleted comments' },
        orderBy: { type: 'string', description: 'Pagination order, usually createdAt or updatedAt' },
      },
    },
    examples: [
      {
        title: 'Issue comments',
        args: { workspace: 'personal', issueId: 'J-559', first: 25 },
      },
      {
        title: 'Inline issue-description comments',
        args: { workspace: 'personal', issueDescriptionId: 'J-559', first: 25 },
      },
      {
        title: 'Replies to a comment',
        args: { workspace: 'personal', parentId: 'comment-uuid', first: 25 },
      },
    ],
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const filter = await buildCommentFilter(client, args)
      const data = await client.query(LIST_COMMENTS_QUERY, {
        filter: Object.keys(filter).length > 0 ? filter : undefined,
        first: (args.first as number) || 25,
        after: args.after as string | undefined,
        includeArchived: args.includeArchived as boolean | undefined,
        orderBy: args.orderBy as string | undefined,
      })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'check_comment_schema_drift',
    description: 'Check the live Linear GraphQL schema for comment fields, filters, and create/update input fields used by the MCP.',
    sideEffect: 'read',
    inputSchema: {
      type: 'object',
      properties: { ...WORKSPACE_PROP },
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await checkCommentSchemaDrift(client)
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'create_comment',
    description: 'Add a comment to an issue, project, initiative, document content, project update, initiative update, or post. Provide exactly one target. Use parentId to reply; use quotedText with issueDescriptionId/documentId to create a real inline source anchor.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        body: { type: 'string', description: 'Comment body (markdown) (required)' },
        ...COMMENT_TARGET_PROPS,
        parentId: { type: 'string', description: 'Parent comment UUID (threaded reply)' },
        quotedText: { type: 'string', description: 'Exact selected text for inline comments. For GUI highlights, use issueDescriptionId or documentId.' },
        bodyData: { type: 'object', description: 'Optional Linear rich-text bodyData JSON. Omit for normal markdown body.' },
      },
      required: ['body'],
    },
    examples: [
      {
        title: 'Issue comment',
        args: { workspace: 'personal', issueId: 'J-559', body: 'Verified docs and runtime tool discovery.' },
      },
      {
        title: 'Inline issue-description anchor',
        description: 'Use issueDescriptionId plus exact quotedText when the comment should highlight source text in the Linear GUI.',
        args: { workspace: 'personal', issueDescriptionId: 'J-559', quotedText: 'ToolDef.description', body: 'This wording should match runtime behavior.' },
      },
      {
        title: 'Threaded reply',
        args: { workspace: 'personal', issueId: 'J-559', parentId: 'comment-uuid', body: 'Follow-up reply.' },
      },
    ],
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const input = await buildCommentCreateInput(client, args, args.body as string)
      const inlineAnchor = await prepareInlineAnchor(client, args)
      if (inlineAnchor) input.id = inlineAnchor.commentId
      const data = await client.query(CREATE_COMMENT_MUTATION, { input })
      if (!inlineAnchor) return JSON.stringify(data, null, 2)
      const anchorResult = await inlineAnchor.apply()
      return JSON.stringify({ ...(data as object), inlineAnchor: { target: inlineAnchor.target, result: anchorResult } }, null, 2)
    },
  },
  {
    name: 'update_comment',
    description: 'Edit an existing comment.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Comment UUID' },
        body: { type: 'string', description: 'New comment body (markdown)' },
      },
      required: ['id', 'body'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(UPDATE_COMMENT_MUTATION, {
        id: args.id,
        input: { body: args.body },
      })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'delete_comment',
    description: 'Delete a comment.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Comment UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(DELETE_COMMENT_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'resolve_comment',
    description: 'Mark a comment as resolved.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Comment UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(RESOLVE_COMMENT_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'unresolve_comment',
    description: 'Mark a comment as unresolved.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Comment UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(UNRESOLVE_COMMENT_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
]
