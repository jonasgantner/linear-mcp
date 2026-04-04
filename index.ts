import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { loadWorkspaces } from './workspaces.js'
import { registerTools } from './tools/registry.js'

process.on('unhandledRejection', err => {
  process.stderr.write(`linear-mcp: unhandled rejection: ${err}\n`)
})
process.on('uncaughtException', err => {
  process.stderr.write(`linear-mcp: uncaught exception: ${err}\n`)
})

loadWorkspaces()

const server = new Server(
  { name: 'linear', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

registerTools(server)

const transport = new StdioServerTransport()
await server.connect(transport)

let shuttingDown = false
function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  process.stderr.write('linear-mcp: shutting down\n')
  // Force exit after 2s if server.close() hangs
  setTimeout(() => process.exit(0), 2000)
  void server.close().finally(() => process.exit(0))
}

process.stdin.on('end', shutdown)
process.stdin.on('close', shutdown)
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

// PPID watchdog: independent process that kills us if parent dies.
import { spawn } from 'child_process'
const watchdog = spawn('bash', ['-c', `
  while true; do
    sleep 5
    PPID_NOW=$(ps -o ppid= -p $PPID 2>/dev/null | tr -d ' ')
    if [ -z "$PPID_NOW" ] || [ "$PPID_NOW" = "1" ]; then
      kill -9 $PPID 2>/dev/null
      exit 0
    fi
  done
`], { detached: true, stdio: 'ignore' })
watchdog.unref()

process.stderr.write('linear-mcp: server ready\n')
