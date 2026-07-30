import assert from 'node:assert/strict'
import { listFullComments, MAX_COMMENT_LIMIT } from '../tools/commentRead.js'

type QueryCall = {
  query: string
  variables: Record<string, unknown>
}

class FakeClient {
  calls: QueryCall[] = []

  async query<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    this.calls.push({ query, variables })
    return {
      comments: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [
          {
            id: 'comment-1',
            body: [
              'Full body stays intact.',
              'Screenshot: ![Shelf photo](https://uploads.linear.app/abc/shelf-photo.png)',
              'PDF: [audit.pdf](https://uploads.linear.app/abc/audit.pdf)',
              'Bare upload: https://uploads.linear.app/abc/raw-upload.jpg',
              'Ordinary link: [Linear](https://linear.app/example)',
            ].join('\n'),
            quotedText: 'quoted source text',
            url: 'https://linear.app/example/comment/comment-1',
            issueId: 'issue-1',
            projectId: null,
            initiativeId: null,
            documentContentId: null,
            projectUpdateId: null,
            initiativeUpdateId: null,
            parentId: null,
            resolvingCommentId: null,
            user: { id: 'user-1', name: 'Tester' },
            resolvingUser: null,
            botActor: { id: 'bot-1', name: 'Agent', type: 'agent', subType: 'codex', userDisplayName: 'Codex' },
            externalUser: null,
            onBehalfOf: { id: 'user-2', name: 'Requester', displayName: 'Requester' },
            reactionData: { thumbsUp: 2 },
            hideInLinear: false,
            threadSummary: { summary: 'short thread summary' },
            createdAt: '2026-06-26T08:00:00.000Z',
            updatedAt: '2026-06-26T08:00:00.000Z',
            editedAt: null,
            archivedAt: null,
            resolvedAt: null,
            children: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  id: 'reply-1',
                  body: 'Reply keeps full body and ![reply.png](https://uploads.linear.app/abc/reply.png)',
                  quotedText: null,
                  url: 'https://linear.app/example/comment/reply-1',
                  issueId: 'issue-1',
                  projectId: null,
                  initiativeId: null,
                  documentContentId: null,
                  projectUpdateId: null,
                  initiativeUpdateId: null,
                  parentId: 'comment-1',
                  resolvingCommentId: null,
                  user: { id: 'user-4', name: 'Responder' },
                  resolvingUser: null,
                  botActor: null,
                  externalUser: null,
                  onBehalfOf: null,
                  reactionData: {},
                  hideInLinear: false,
                  threadSummary: null,
                  createdAt: '2026-06-26T08:01:00.000Z',
                  updatedAt: '2026-06-26T08:01:00.000Z',
                  editedAt: null,
                  archivedAt: null,
                  resolvedAt: null,
                },
              ],
            },
          },
        ],
      },
    } as T
  }
}

await assert.rejects(
  () => listFullComments(new FakeClient() as never, { first: MAX_COMMENT_LIMIT + 1 }),
  /at most 250 comments/,
)

const client = new FakeClient()
const listed = await listFullComments(client as never, { first: 10 })

const query = client.calls[0]?.query ?? ''
for (const field of ['botActor', 'externalUser', 'onBehalfOf', 'reactionData', 'hideInLinear', 'threadSummary']) {
  assert.match(query, new RegExp(`\\b${field}\\b`), `comment GraphQL selection should include ${field}`)
}
assert.equal(client.calls[0]?.variables.first, 10, 'small reads should preserve requested first value')

const comment = listed.comments.nodes[0] as Record<string, any>
assert.equal(comment.body.includes('Full body stays intact.'), true, 'comment readback should stay full-body')
assert.equal(comment.botActor?.name, 'Agent')
assert.equal(comment.onBehalfOf?.name, 'Requester')
assert.equal(comment.reactionData.thumbsUp, 2)
assert.equal(comment.hideInLinear, false)
assert.equal(comment.threadSummary.summary, 'short thread summary')

assert.deepEqual(
  comment.assets.map((asset: Record<string, unknown>) => ({
    type: asset.type,
    label: asset.label,
    fileName: asset.fileName,
    source: asset.source,
  })),
  [
    { type: 'image', label: 'Shelf photo', fileName: 'shelf-photo.png', source: 'markdown-image' },
    { type: 'file', label: 'audit.pdf', fileName: 'audit.pdf', source: 'markdown-link' },
    { type: 'image', label: null, fileName: 'raw-upload.jpg', source: 'bare-url' },
  ],
)

const child = comment.children.nodes[0] as Record<string, any>
assert.equal(child.body.includes('Reply keeps full body'), true, 'child readback should stay full-body')
assert.equal(child.assets[0]?.fileName, 'reply.png', 'child assets should be extracted recursively')

console.log(JSON.stringify({ ok: true, maxCommentLimit: MAX_COMMENT_LIMIT }, null, 2))
