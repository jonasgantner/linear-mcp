import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { ToolDef } from './_types.js'
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

const allTools: ToolDef[] = [
  ...userTools,
  ...teamTools,
  ...issueTools,
  ...projectTools,
  ...commentTools,
  ...cycleTools,
  ...labelTools,
  ...initiativeTools,
  ...notificationTools,
  ...relationTools,
  ...reactionTools,
  ...documentTools,
  ...viewTools,
]

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
