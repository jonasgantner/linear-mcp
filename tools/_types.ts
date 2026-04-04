export type ToolDef = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler: (args: Record<string, unknown>) => Promise<string>
}

export const WORKSPACE_PROP = {
  workspace: {
    type: 'string',
    description: 'Workspace: biz (default) or personal.',
  },
} as const

export const PAGINATION_PROPS = {
  first: { type: 'integer', description: 'Number of results (default: 50, max: 250)' },
  after: { type: 'string', description: 'Cursor for next page (from pageInfo.endCursor)' },
} as const
