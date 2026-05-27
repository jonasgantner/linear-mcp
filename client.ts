import type { LinearWorkspace } from './workspaces.js'

export class LinearError extends Error {
  constructor(
    public status: number,
    public body: string,
    public workspace: string,
  ) {
    const messages: Record<number, string> = {
      401: `Invalid credentials for workspace "${workspace}"`,
      403: `Insufficient permissions on workspace "${workspace}"`,
      429: `Rate limited on workspace "${workspace}", try again`,
    }
    super(messages[status] ?? `Linear API error ${status} on workspace "${workspace}": ${body.slice(0, 200)}`)
  }
}

const GRAPHQL_URL = 'https://api.linear.app/graphql'
const lastRequest = new Map<string, number>()
const MIN_INTERVAL = 250

async function throttle(workspace: string): Promise<void> {
  const last = lastRequest.get(workspace) ?? 0
  const wait = MIN_INTERVAL - (Date.now() - last)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastRequest.set(workspace, Date.now())
}

export class LinearClient {
  constructor(private workspace: LinearWorkspace) {}

  async query<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
    await throttle(this.workspace.name)
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.workspace.token,
      },
      body: JSON.stringify({ query, variables }),
    })
    if (!res.ok) {
      throw new LinearError(res.status, await res.text(), this.workspace.name)
    }
    const json = (await res.json()) as {
      data?: T
      errors?: Array<{
        message: string
        extensions?: { userPresentableMessage?: string; validationErrors?: unknown }
      }>
    }
    if (json.errors?.length) {
      const details = json.errors.map(e => e.extensions?.userPresentableMessage ?? e.message).join('; ')
      throw new Error(`GraphQL error on ${this.workspace.name}: ${details}`)
    }
    return json.data as T
  }
}
