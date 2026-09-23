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
  | 'favorites'
  | 'views'
  | 'notifications'
  | 'attachments'
  | 'files'
  | 'batch'
  | 'templates'
  | 'metadata'

export type ToolSideEffect = 'read' | 'write' | 'delete' | 'upload'

export type ToolExample = {
  title?: string
  description?: string
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
    description: 'Workspace: interlink-group (default) or personal.',
  },
} as const

export const PAGINATION_PROPS = {
  first: { type: 'integer', description: 'Number of results (default: 50, max: 250)' },
  after: { type: 'string', description: 'Cursor for next page (from pageInfo.endCursor)' },
} as const

/** Shared opt-in for Linear connections that omit archived and trashed records by default. */
export const INCLUDE_ARCHIVED_PROP = {
  includeArchived: {
    type: 'boolean',
    description: 'Include archived and recently deleted (trashed) items. Defaults to false.',
  },
} as const

/** Issue-only filter because other core Linear filters do not expose archivedAt. */
export const ARCHIVED_ONLY_PROP = {
  archivedOnly: {
    type: 'boolean',
    description: 'Return only issues whose archivedAt is non-null. Implies includeArchived; recently deleted issues can appear with trashed=true.',
  },
} as const
