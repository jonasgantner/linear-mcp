import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'
import { COMMENT_TARGET_PROPS, buildCommentCreateInput } from './commentTargets.js'
import { prepareInlineAnchor } from './inlineAnchors.js'

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
