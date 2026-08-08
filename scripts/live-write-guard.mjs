const ALLOWED_WORKSPACES = new Set(['personal', 'interlink-group'])

function argValue(argv, name) {
  const index = argv.indexOf(name)
  return index === -1 ? null : argv[index + 1] ?? null
}

export function requireLiveWriteTarget(argv = process.argv.slice(2)) {
  const workspace = argValue(argv, '--workspace')
  const confirmation = argValue(argv, '--confirm-live-write')
  const usage = '--workspace <personal|interlink-group> --confirm-live-write <same-workspace>'

  if (!workspace) {
    throw new Error(`Live-write tests require an explicit workspace. Usage: ${usage}`)
  }
  if (!ALLOWED_WORKSPACES.has(workspace)) {
    throw new Error(`Live-write workspace must be "personal" or "interlink-group"; received "${workspace}".`)
  }
  if (!confirmation) {
    throw new Error(`Live-write tests require a matching confirmation flag. Usage: ${usage}`)
  }
  if (confirmation !== workspace) {
    throw new Error(`Live-write confirmation "${confirmation}" does not match workspace "${workspace}".`)
  }

  return workspace
}
