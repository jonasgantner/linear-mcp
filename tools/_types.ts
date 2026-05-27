export type ToolDomain =
  | 'users'
  | 'teams'
  | 'issues'
  | 'issue-relations'
  | 'comments'
  | 'reactions'
  | 'projects'
  | 'cycles'
  | 'labels'
  | 'initiatives'
  | 'documents'
  | 'views'
  | 'notifications'
  | 'attachments'
  | 'files'
  | 'batch'
  | 'templates'

export type ToolSideEffect = 'read' | 'write' | 'delete' | 'upload'

export type ToolExample = {
  title?: string
  args: Record<string, unknown>
}

export type ToolDef = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler: (args: Record<string, unknown>) => Promise<string>
  domain?: ToolDomain
  sideEffect?: ToolSideEffect
  featureGate?: string
  examples?: ToolExample[]
  sourceFile?: string
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
