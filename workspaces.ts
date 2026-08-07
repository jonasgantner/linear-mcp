export type LinearWorkspace = {
  name: string
  token: string
  authScheme: 'api-key' | 'oauth-bearer'
  writeActor: 'user' | 'app'
  appToken?: string
}

const WORKSPACE_DEFS: [string, string][] = [
  ['biz', 'LINEAR_BIZ_TOKEN'],
  ['personal', 'LINEAR_PERSONAL_TOKEN'],
  ['test', 'LINEAR_TEST_TOKEN'],
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
    const requestedActor = name === 'test'
      ? (environment.LINEAR_TEST_WRITE_ACTOR || 'user').toLowerCase()
      : 'user'
    if (requestedActor !== 'user' && requestedActor !== 'app') {
      throw new Error(`Invalid LINEAR_TEST_WRITE_ACTOR "${requestedActor}". Expected "user" or "app".`)
    }
    const appToken = name === 'test' ? environment.LINEAR_TEST_APP_TOKEN : undefined
    if (requestedActor === 'app' && !appToken) {
      throw new Error('LINEAR_TEST_WRITE_ACTOR is "app" but LINEAR_TEST_APP_TOKEN is not configured; refusing to fall back to the user actor.')
    }
    discovered.push({
      name,
      token,
      authScheme: 'api-key',
      writeActor: requestedActor,
      appToken,
    })
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
    throw new Error('No Linear workspaces configured. Set LINEAR_BIZ_TOKEN, LINEAR_PERSONAL_TOKEN, and/or LINEAR_TEST_TOKEN.')
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

export function selectAuthorWorkspace(workspace: LinearWorkspace): LinearWorkspace {
  if (workspace.writeActor !== 'app') return workspace
  if (!workspace.appToken) {
    throw new Error(`Workspace "${workspace.name}" requests app-authored writes but has no app token; refusing to fall back to the user actor.`)
  }
  return {
    ...workspace,
    token: workspace.appToken,
    authScheme: 'oauth-bearer',
  }
}

export function resolveAuthorWorkspace(workspace?: string): LinearWorkspace {
  return selectAuthorWorkspace(resolveWorkspace(workspace))
}
