import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'

const CREATE_REACTION_MUTATION = `
  mutation CreateReaction($input: ReactionCreateInput!) {
    reactionCreate(input: $input) {
      success
      reaction { id emoji user { name } }
    }
  }
`

const DELETE_REACTION_MUTATION = `
  mutation DeleteReaction($id: String!) {
    reactionDelete(id: $id) { success }
  }
`

export const reactionTools: ToolDef[] = [
  {
    name: 'create_reaction',
    description: 'Add an emoji reaction to a comment, issue, project update, or initiative update. Provide exactly one target ID.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        emoji: { type: 'string', description: 'Emoji name (e.g. "+1", "heart", "rocket") (required)' },
        commentId: { type: 'string', description: 'Comment UUID (react to comment)' },
        issueId: { type: 'string', description: 'Issue UUID (react to issue)' },
        projectUpdateId: { type: 'string', description: 'Project update UUID' },
        initiativeUpdateId: { type: 'string', description: 'Initiative update UUID' },
      },
      required: ['emoji'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, ...input } = args
      const data = await client.query(CREATE_REACTION_MUTATION, { input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'delete_reaction',
    description: 'Remove an emoji reaction.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Reaction UUID (required)' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(DELETE_REACTION_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
]
