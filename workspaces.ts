export type LinearWorkspace = {
  name: string
  token: string
}

const WORKSPACE_DEFS: [string, string][] = [
  ['interlink-group', 'LINEAR_INTERLINK_GROUP_TOKEN'],
  ['personal', 'LINEAR_PERSONAL_TOKEN'],
]

let workspaces: LinearWorkspace[] | null = null

export function discoverWorkspaces(
  environment: Record<string, string | undefined> = process.env,
): LinearWorkspace[] {
  const discovered: LinearWorkspace[] = []
  for (const [name, envVar] of WORKSPACE_DEFS) {
    const token = environment[envVar]
    if (!token) {
      continue
    }
    discovered.push({ name, token })
  }
  return discovered
}

export function configuredWorkspaceNames(): string[] {
  return discoverWorkspaces().map(workspace => workspace.name)
}

export function loadWorkspaces(): LinearWorkspace[] {
  if (workspaces) return workspaces
  workspaces = discoverWorkspaces()
  if (workspaces.length === 0) {
    throw new Error('No Linear workspaces configured. Set LINEAR_INTERLINK_GROUP_TOKEN and/or LINEAR_PERSONAL_TOKEN.')
  }
  return workspaces
}

export function resolveWorkspace(workspace?: string): LinearWorkspace {
  const all = loadWorkspaces()
  if (!workspace) return all.find(w => w.name === 'interlink-group') ?? all[0]
  const found = all.find(w => w.name === workspace)
  if (!found) {
    throw new Error(`Workspace "${workspace}" not found. Available: ${all.map(w => w.name).join(', ')}`)
  }
  return found
}
