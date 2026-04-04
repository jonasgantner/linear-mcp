import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'

const VIEWER_QUERY = `
  query Viewer {
    viewer {
      id name displayName email admin active
      createdAt updatedAt
      organization { id name urlKey }
    }
  }
`

export const userTools: ToolDef[] = [
  {
    name: 'get_viewer',
    description: 'Get the authenticated user and organization info for a workspace.',
    inputSchema: {
      type: 'object',
      properties: { ...WORKSPACE_PROP },
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(VIEWER_QUERY)
      return JSON.stringify(data, null, 2)
    },
  },
]
