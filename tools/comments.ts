import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'

const CREATE_COMMENT_MUTATION = `
  mutation CreateComment($input: CommentCreateInput!) {
    commentCreate(input: $input) {
      success
      comment { id body user { name } createdAt }
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
    description: 'Add a comment to an issue, project update, or initiative update. Provide exactly one target ID. Use parentId to reply to an existing comment.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        body: { type: 'string', description: 'Comment body (markdown) (required)' },
        issueId: { type: 'string', description: 'Issue UUID or identifier (comment on issue)' },
        projectUpdateId: { type: 'string', description: 'Project update UUID (reply to project update)' },
        initiativeUpdateId: { type: 'string', description: 'Initiative update UUID (reply to initiative update)' },
        parentId: { type: 'string', description: 'Parent comment UUID (threaded reply)' },
      },
      required: ['body'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, ...input } = args
      const data = await client.query(CREATE_COMMENT_MUTATION, { input })
      return JSON.stringify(data, null, 2)
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
