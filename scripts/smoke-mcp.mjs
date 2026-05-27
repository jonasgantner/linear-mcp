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
  const names = (tools.tools ?? []).map(tool => tool.name)
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
