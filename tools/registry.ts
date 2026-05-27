import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { ToolDef, ToolDomain, ToolSideEffect } from './_types.js'
import { userTools } from './users.js'
import { teamTools } from './teams.js'
import { issueTools } from './issues.js'
import { projectTools } from './projects.js'
import { commentTools } from './comments.js'
import { cycleTools } from './cycles.js'
import { labelTools } from './labels.js'
import { initiativeTools } from './initiatives.js'
import { notificationTools } from './notifications.js'
import { relationTools } from './relations.js'
import { reactionTools } from './reactions.js'
import { documentTools } from './documents.js'
import { viewTools } from './views.js'
import { fileTools } from './files.js'
import { attachmentTools } from './attachments.js'
import { batchTools } from './batch.js'
import { templateTools } from './templates.js'

type ToolGroup = {
  domain: ToolDomain
  sourceFile: string
  tools: ToolDef[]
}

const FEATURE_GATES: Record<string, string> = {
  link_attachment_discord: 'Requires the Discord OAuth integration in the Linear workspace.',
  create_initiative_relation: 'Requires Linear Enterprise sub-initiative relations.',
  update_initiative_relation: 'Requires Linear Enterprise sub-initiative relations.',
  delete_initiative_relation: 'Requires Linear Enterprise sub-initiative relations.',
  add_initiative_label: 'Requires initiative labels to be enabled for the workspace.',
  remove_initiative_label: 'Requires initiative labels to be enabled for the workspace.',
}

const rawToolGroups: ToolGroup[] = [
  { domain: 'users', sourceFile: 'tools/users.ts', tools: userTools },
  { domain: 'teams', sourceFile: 'tools/teams.ts', tools: teamTools },
  { domain: 'issues', sourceFile: 'tools/issues.ts', tools: issueTools },
  { domain: 'projects', sourceFile: 'tools/projects.ts', tools: projectTools },
  { domain: 'comments', sourceFile: 'tools/comments.ts', tools: commentTools },
  { domain: 'cycles', sourceFile: 'tools/cycles.ts', tools: cycleTools },
  { domain: 'labels', sourceFile: 'tools/labels.ts', tools: labelTools },
  { domain: 'initiatives', sourceFile: 'tools/initiatives.ts', tools: initiativeTools },
  { domain: 'notifications', sourceFile: 'tools/notifications.ts', tools: notificationTools },
  { domain: 'issue-relations', sourceFile: 'tools/relations.ts', tools: relationTools },
  { domain: 'reactions', sourceFile: 'tools/reactions.ts', tools: reactionTools },
  { domain: 'documents', sourceFile: 'tools/documents.ts', tools: documentTools },
  { domain: 'views', sourceFile: 'tools/views.ts', tools: viewTools },
  { domain: 'files', sourceFile: 'tools/files.ts', tools: fileTools },
  { domain: 'attachments', sourceFile: 'tools/attachments.ts', tools: attachmentTools },
  { domain: 'batch', sourceFile: 'tools/batch.ts', tools: batchTools },
  { domain: 'templates', sourceFile: 'tools/templates.ts', tools: templateTools },
]

function inferSideEffect(name: string): ToolSideEffect {
  if (/^(get|list|search)_/.test(name)) return 'read'
  if (name === 'upload_file' || name === 'upload_image_from_url' || name.endsWith('_with_files') || name.startsWith('append_')) return 'upload'
  if (name.startsWith('delete_')) return 'delete'
  return 'write'
}

function withMetadata(group: ToolGroup): ToolDef[] {
  return group.tools.map(tool => ({
    ...tool,
    domain: tool.domain ?? group.domain,
    sideEffect: tool.sideEffect ?? inferSideEffect(tool.name),
    featureGate: tool.featureGate ?? FEATURE_GATES[tool.name],
    sourceFile: tool.sourceFile ?? group.sourceFile,
  }))
}

export const toolGroups: ToolGroup[] = rawToolGroups.map(group => ({
  ...group,
  tools: withMetadata(group),
}))

export const allTools: ToolDef[] = toolGroups.flatMap(group => group.tools)

export function getToolInventory(): Array<{
  name: string
  description: string
  domain: ToolDomain | undefined
  sideEffect: ToolSideEffect | undefined
  featureGate: string | undefined
  sourceFile: string | undefined
  inputSchema: Record<string, unknown>
}> {
  return allTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    domain: tool.domain,
    sideEffect: tool.sideEffect,
    featureGate: tool.featureGate,
    sourceFile: tool.sourceFile,
    inputSchema: tool.inputSchema,
  }))
}

const toolMap = new Map<string, ToolDef>()
for (const t of allTools) toolMap.set(t.name, t)

export function registerTools(server: Server): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async req => {
    const tool = toolMap.get(req.params.name)
    if (!tool) {
      return { content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }], isError: true }
    }
    try {
      const args = (req.params.arguments ?? {}) as Record<string, unknown>
      const text = await tool.handler(args)
      return { content: [{ type: 'text', text }] }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true }
    }
  })
}
