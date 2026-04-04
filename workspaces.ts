export type LinearWorkspace = {
  name: string
  token: string
}

let workspaces: LinearWorkspace[] | null = null

/**
 * Auto-discover workspaces from env vars matching LINEAR_*_TOKEN.
 * e.g. LINEAR_BIZ_TOKEN → workspace "biz", LINEAR_WORK_TOKEN → workspace "work"
 */
export function loadWorkspaces(): LinearWorkspace[] {
  if (workspaces) return workspaces
  workspaces = []
  for (const [key, value] of Object.entries(process.env)) {
    const match = key.match(/^LINEAR_(.+)_TOKEN$/)
    if (match && value) {
      workspaces.push({ name: match[1].toLowerCase(), token: value })
    }
  }
  if (workspaces.length === 0) {
    process.stderr.write('linear-mcp: no workspaces configured. Set LINEAR_<NAME>_TOKEN env vars.\n')
    process.exit(1)
  }
  process.stderr.write(`linear-mcp: loaded ${workspaces.length} workspace(s): ${workspaces.map(w => w.name).join(', ')}\n`)
  return workspaces
}

export function resolveWorkspace(workspace?: string): LinearWorkspace {
  const all = loadWorkspaces()
  if (!workspace) return all[0]
  const found = all.find(w => w.name === workspace)
  if (!found) {
    throw new Error(`Workspace "${workspace}" not found. Available: ${all.map(w => w.name).join(', ')}`)
  }
  return found
}
