export type LinearWorkspace = {
  name: string
  token: string
}

const WORKSPACE_DEFS: [string, string][] = [
  ['biz', 'LINEAR_BIZ_TOKEN'],
  ['personal', 'LINEAR_PERSONAL_TOKEN'],
]

let workspaces: LinearWorkspace[] | null = null

export function loadWorkspaces(): LinearWorkspace[] {
  if (workspaces) return workspaces
  workspaces = []
  for (const [name, envVar] of WORKSPACE_DEFS) {
    const token = process.env[envVar]
    if (!token) {
      process.stderr.write(`linear-mcp: missing ${envVar}, skipping workspace "${name}"\n`)
      continue
    }
    workspaces.push({ name, token })
  }
  if (workspaces.length === 0) {
    process.stderr.write('linear-mcp: no workspaces configured\n')
    process.exit(1)
  }
  return workspaces
}

export function resolveWorkspace(workspace?: string): LinearWorkspace {
  const all = loadWorkspaces()
  if (!workspace) return all.find(w => w.name === 'biz') ?? all[0]
  const found = all.find(w => w.name === workspace)
  if (!found) {
    throw new Error(`Workspace "${workspace}" not found. Available: ${all.map(w => w.name).join(', ')}`)
  }
  return found
}
