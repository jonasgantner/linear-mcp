import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'

const ATTACHMENT_FIELDS = `
  id title subtitle url sourceType source metadata
  creator { name }
  issue { id identifier }
  createdAt updatedAt
`

const CREATE_ATTACHMENT_MUTATION = `
  mutation CreateAttachment($input: AttachmentCreateInput!) {
    attachmentCreate(input: $input) {
      success
      attachment { ${ATTACHMENT_FIELDS} }
    }
  }
`

const UPDATE_ATTACHMENT_MUTATION = `
  mutation UpdateAttachment($id: String!, $input: AttachmentUpdateInput!) {
    attachmentUpdate(id: $id, input: $input) {
      success
      attachment { ${ATTACHMENT_FIELDS} }
    }
  }
`

const DELETE_ATTACHMENT_MUTATION = `
  mutation DeleteAttachment($id: String!) {
    attachmentDelete(id: $id) { success }
  }
`

const LINK_URL_MUTATION = `
  mutation LinkURL($issueId: String!, $url: String!, $title: String) {
    attachmentLinkURL(issueId: $issueId, url: $url, title: $title) {
      success
      attachment { ${ATTACHMENT_FIELDS} }
    }
  }
`

const LINK_DISCORD_MUTATION = `
  mutation LinkDiscord($issueId: String!, $channelId: String!, $messageId: String!, $url: String!, $title: String) {
    attachmentLinkDiscord(issueId: $issueId, channelId: $channelId, messageId: $messageId, url: $url, title: $title) {
      success
      attachment { ${ATTACHMENT_FIELDS} }
    }
  }
`

export const attachmentTools: ToolDef[] = [
  {
    name: 'create_attachment',
    description: 'Attach a URL/resource to an issue. Supports optional metadata (JSON), iconUrl, and commentBody (auto-creates a comment on the issue).',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        issueId: { type: 'string', description: 'Issue UUID or identifier' },
        title: { type: 'string', description: 'Attachment title' },
        url: { type: 'string', description: 'URL to link' },
        subtitle: { type: 'string', description: 'Subtitle text' },
        iconUrl: { type: 'string', description: 'Icon URL for the attachment' },
        metadata: { type: 'object', description: 'Free-form JSON metadata' },
        commentBody: { type: 'string', description: 'If set, auto-creates a comment on the issue with this body' },
      },
      required: ['issueId', 'title', 'url'],
    },
    examples: [
      {
        title: 'External resource card',
        description: 'Use attachments for URLs/resources, not local file uploads.',
        args: { workspace: 'personal', issueId: 'J-559', title: 'Linear API docs', url: 'https://developers.linear.app/docs/graphql/working-with-the-graphql-api' },
      },
      {
        title: 'Resource card with comment',
        args: { workspace: 'personal', issueId: 'J-559', title: 'Design note', url: 'https://example.com/design-note', commentBody: 'Linked for context.' },
      },
    ],
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, ...input } = args
      const data = await client.query(CREATE_ATTACHMENT_MUTATION, { input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'update_attachment',
    description: 'Update an attachment\'s title, subtitle, url, or metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Attachment UUID' },
        title: { type: 'string', description: 'New title' },
        subtitle: { type: 'string', description: 'New subtitle' },
        url: { type: 'string', description: 'New URL' },
        metadata: { type: 'object', description: 'New metadata (JSON)' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, id, ...input } = args
      const data = await client.query(UPDATE_ATTACHMENT_MUTATION, { id, input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'delete_attachment',
    description: 'Delete an attachment from an issue.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Attachment UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(DELETE_ATTACHMENT_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'link_attachment_url',
    description: 'Simplified URL attachment. Links a URL to an issue with auto-detected metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        issueId: { type: 'string', description: 'Issue UUID or identifier' },
        url: { type: 'string', description: 'URL to link' },
        title: { type: 'string', description: 'Optional title override' },
      },
      required: ['issueId', 'url'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(LINK_URL_MUTATION, {
        issueId: args.issueId,
        url: args.url,
        title: args.title,
      })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'link_attachment_discord',
    description: 'Link a Discord message to an issue using Linear\'s Discord integration. Requires Discord OAuth integration in the Linear workspace. For Discord thread messages, pass the thread ID as channelId, the in-thread message ID as messageId, and the full /channels/<guild>/<thread>/<message> URL; Linear opens back into the correct thread on click. Use create_attachment with a Discord URL as fallback if integration is not set up.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        issueId: { type: 'string', description: 'Issue UUID or identifier' },
        channelId: { type: 'string', description: 'Discord channel ID, or thread ID when linking a message inside a Discord thread' },
        messageId: { type: 'string', description: 'Discord message ID; for thread links this is the message ID inside the thread' },
        url: { type: 'string', description: 'Full Discord message URL (https://discord.com/channels/...)' },
        title: { type: 'string', description: 'Optional title (defaults to "Discord message")' },
      },
      required: ['issueId', 'channelId', 'messageId', 'url'],
    },
    examples: [
      {
        title: 'Discord message in biz',
        description: 'The Discord integration is enabled in biz; use create_attachment with the URL as fallback when the integration rejects the link.',
        args: { workspace: 'biz', issueId: 'SPE-123', channelId: 'discord-channel-id', messageId: 'discord-message-id', url: 'https://discord.com/channels/guild/channel/message' },
      },
      {
        title: 'Discord thread message in biz',
        description: 'Use the Discord thread ID as channelId. Verified with SPE-2217: clicking the Linear attachment opened the linked Discord thread.',
        args: { workspace: 'biz', issueId: 'SPE-123', channelId: 'discord-thread-id', messageId: 'thread-message-id', url: 'https://discord.com/channels/guild/thread/message', title: 'Discord thread' },
      },
    ],
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(LINK_DISCORD_MUTATION, {
        issueId: args.issueId,
        channelId: args.channelId,
        messageId: args.messageId,
        url: args.url,
        title: args.title,
      })
      return JSON.stringify(data, null, 2)
    },
  },
]
