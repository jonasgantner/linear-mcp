import { spawn } from 'node:child_process'

const [,, command, ...rawArgs] = process.argv
if (!command) {
  console.error('Usage: node scripts/smoke-mcp.mjs <command> [args...] [--call <tool> [json-args]]')
  process.exit(2)
}

const callIndex = rawArgs.indexOf('--call')
const args = callIndex === -1 ? rawArgs : rawArgs.slice(0, callIndex)
const callTool = callIndex === -1 ? null : rawArgs[callIndex + 1]
const callArgsRaw = callIndex === -1 ? null : rawArgs[callIndex + 2]
const callArgs = callArgsRaw ? JSON.parse(callArgsRaw) : {}

if (callIndex !== -1 && !callTool) {
  console.error('Missing tool name after --call')
  process.exit(2)
}

const child = spawn(command, args, {
  stdio: ['pipe', 'pipe', 'pipe'],
})

let stdout = ''
let stderr = ''
let nextId = 1
const responses = new Map()

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`)
}

function request(method, params = {}) {
  const id = nextId++
  send({ jsonrpc: '2.0', id, method, params })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), 15000)
    responses.set(id, value => {
      clearTimeout(timer)
      if (value.error) reject(new Error(`${method}: ${JSON.stringify(value.error)}`))
      else resolve(value.result)
    })
  })
}

function assertSearchIssuesOrderBySchema(tools) {
  const searchIssues = tools.find(tool => tool.name === 'search_issues')
  const orderBy = searchIssues?.inputSchema?.properties?.orderBy
  const expected = ['updatedAt', 'createdAt']
  const actual = orderBy?.enum
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`search_issues.orderBy enum drift: expected ${expected.join(', ')}, got ${JSON.stringify(actual)}`)
  }
}

function assertArchiveSchemas(tools) {
  const coreReads = ['search_issues', 'search_projects', 'list_initiatives', 'search_documents', 'list_cycles']
  for (const name of coreReads) {
    const properties = tools.find(tool => tool.name === name)?.inputSchema?.properties
    if (!properties?.includeArchived) {
      throw new Error(`${name} is missing includeArchived`)
    }
  }

  const issueProperties = tools.find(tool => tool.name === 'search_issues')?.inputSchema?.properties
  if (!issueProperties?.archivedOnly) {
    throw new Error('search_issues is missing archivedOnly')
  }

  for (const name of coreReads.slice(1)) {
    const properties = tools.find(tool => tool.name === name)?.inputSchema?.properties
    if (properties?.archivedOnly) {
      throw new Error(`${name} must not expose archivedOnly because Linear cannot filter it reliably`)
    }
  }
}

function assertArchiveToolNames(tools) {
  const names = new Set(tools.map(tool => tool.name))
  for (const name of ['delete_project', 'delete_initiative', 'unarchive_document']) {
    if (!names.has(name)) throw new Error(`Missing lifecycle tool: ${name}`)
  }
  if (names.has('archive_project')) throw new Error('Removed tool archive_project is still published')
  if (names.size !== 138) throw new Error(`Expected 138 tools, got ${names.size}`)
}

function assertToolAnnotations(tools) {
  const missing = tools.filter(tool => !tool.annotations).map(tool => tool.name)
  if (missing.length) {
    throw new Error(`tool annotations missing for ${missing.length} tool(s): ${missing.slice(0, 12).join(', ')}`)
  }

  const expectedByTool = {
    list_initiatives: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    update_issue: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    delete_issue: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    delete_project: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    delete_initiative: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    unarchive_document: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }

  for (const name of [
    'archive_issue',
    'unarchive_issue',
    'unarchive_project',
    'archive_initiative',
    'unarchive_initiative',
    'unarchive_document',
    'cycle_archive',
  ]) {
    expectedByTool[name] = {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    }
  }

  for (const [name, expected] of Object.entries(expectedByTool)) {
    const actual = tools.find(tool => tool.name === name)?.annotations
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${name} annotations drift: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    }
  }
}

function assertWorkspaceDescriptions(tools) {
  const descriptions = tools
    .map(tool => tool.inputSchema?.properties?.workspace?.description)
    .filter(Boolean)
  if (descriptions.length === 0) {
    throw new Error('No runtime workspace descriptions were published')
  }
  const expected = 'Workspace: interlink-group (default) or personal.'
  const unexpected = [...new Set(descriptions.filter(description => description !== expected))]
  if (unexpected.length > 0) {
    throw new Error(`Runtime workspace description drift: expected "${expected}", got ${JSON.stringify(unexpected)}`)
  }
}

child.stdout.on('data', chunk => {
  stdout += chunk.toString('utf8')
  let index
  while ((index = stdout.indexOf('\n')) !== -1) {
    const line = stdout.slice(0, index).trim()
    stdout = stdout.slice(index + 1)
    if (!line) continue
    const message = JSON.parse(line)
    if (message.id !== undefined && responses.has(message.id)) {
      responses.get(message.id)(message)
      responses.delete(message.id)
    }
  }
})

child.stderr.on('data', chunk => {
  stderr += chunk.toString('utf8')
})

child.on('exit', code => {
  if (code && responses.size) {
    for (const resolve of responses.values()) {
      resolve({ error: { code, message: stderr.trim() || `Process exited ${code}` } })
    }
  }
})

try {
  const init = await request('initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'linear-mcp-smoke', version: '0.1.0' },
  })
  send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })
  const tools = await request('tools/list')
  const toolList = tools.tools ?? []
  assertSearchIssuesOrderBySchema(toolList)
  assertArchiveSchemas(toolList)
  assertArchiveToolNames(toolList)
  assertToolAnnotations(toolList)
  assertWorkspaceDescriptions(toolList)
  const names = toolList.map(tool => tool.name)
  const output = {
    server: init.serverInfo?.name ?? null,
    protocolVersion: init.protocolVersion,
    toolCount: names.length,
    firstTools: names.slice(0, 12),
    stderr: stderr.trim().split('\n').filter(Boolean).slice(0, 8),
  }
  if (callTool) {
    const result = await request('tools/call', {
      name: callTool,
      arguments: callArgs,
    })
    output.call = {
      name: callTool,
      isError: Boolean(result.isError),
      contentPreview: (result.content ?? [])
        .map(item => item.text ?? '')
        .join('\n')
        .slice(0, 1000),
    }
  }
  console.log(JSON.stringify(output, null, 2))
} finally {
  child.stdin.end()
  child.kill('SIGTERM')
}
