import { LinearClient } from '../client.js'
import { extractFileAssets, type FileAsset } from './fileAssets.js'

const COMMENT_LIST_PAGE_SIZE = 20
const COMMENT_CHILD_PAGE_SIZE = 25
export const DEFAULT_COMMENT_LIMIT = 25
export const DEFAULT_EMBEDDED_COMMENT_LIMIT = 100
export const MAX_COMMENT_LIMIT = 250

export const COMMENT_CHILD_FIELDS = `
  id body quotedText url
  issueId projectId initiativeId documentContentId projectUpdateId initiativeUpdateId parentId resolvingCommentId
  user { id name }
  resolvingUser { id name }
  botActor { id name type subType userDisplayName avatarUrl }
  externalUser { id name displayName avatarUrl }
  onBehalfOf { id name displayName avatarUrl }
  reactionData
  hideInLinear
  threadSummary
  createdAt updatedAt editedAt archivedAt resolvedAt
`

export const COMMENT_READ_FIELDS = `
  ${COMMENT_CHILD_FIELDS}
  parent { ${COMMENT_CHILD_FIELDS} }
  children(first: ${COMMENT_CHILD_PAGE_SIZE}) {
    pageInfo { hasNextPage endCursor }
    nodes { ${COMMENT_CHILD_FIELDS} }
  }
`

const LIST_COMMENTS_QUERY = `
  query ListComments($filter: CommentFilter, $first: Int, $after: String, $includeArchived: Boolean, $orderBy: PaginationOrderBy) {
    comments(filter: $filter, first: $first, after: $after, includeArchived: $includeArchived, orderBy: $orderBy) {
      pageInfo { hasNextPage endCursor }
      nodes {
        ${COMMENT_READ_FIELDS}
      }
    }
  }
`

const LIST_COMMENT_CHILDREN_QUERY = `
  query ListCommentChildren($filter: CommentFilter, $first: Int, $after: String, $includeArchived: Boolean, $orderBy: PaginationOrderBy) {
    comments(filter: $filter, first: $first, after: $after, includeArchived: $includeArchived, orderBy: $orderBy) {
      pageInfo { hasNextPage endCursor }
      nodes {
        ${COMMENT_CHILD_FIELDS}
      }
    }
  }
`

const GET_ISSUE_COMMENT_TARGET_QUERY = `
  query GetIssueCommentTarget($id: String!) {
    issue(id: $id) {
      id
      documentContent { id }
    }
  }
`

const GET_DOCUMENT_COMMENT_TARGET_QUERY = `
  query GetDocumentCommentTarget($id: String!) {
    document(id: $id) {
      id
      documentContentId
    }
  }
`

const GET_PROJECT_COMMENT_TARGET_QUERY = `
  query GetProjectCommentTarget($id: String!) {
    project(id: $id) {
      id
      documentContent { id }
    }
  }
`

const GET_INITIATIVE_COMMENT_TARGET_QUERY = `
  query GetInitiativeCommentTarget($id: String!) {
    initiative(id: $id) {
      id
      documentContent { id }
    }
  }
`

type CommentPageInfo = {
  hasNextPage: boolean
  endCursor: string | null
}

type CommentConnection = {
  pageInfo: CommentPageInfo
  nodes: CommentNode[]
}

type CommentNode = {
  id?: string
  children?: CommentConnection
  parent?: CommentNode
  assets?: FileAsset[]
  [key: string]: unknown
}

export type CommentListArgs = {
  filter?: Record<string, unknown>
  first?: number
  after?: string
  includeArchived?: boolean
  orderBy?: string
}

function normalizeLimit(first: unknown, fallback: number): number {
  const raw = typeof first === 'number' ? first : fallback
  const limit = Math.max(1, Math.trunc(Number.isFinite(raw) ? raw : fallback))
  if (limit > MAX_COMMENT_LIMIT) {
    throw new Error(`Comment reads support at most ${MAX_COMMENT_LIMIT} comments per call. Use first <= ${MAX_COMMENT_LIMIT} with after pagination.`)
  }
  return limit
}

function decorateCommentReadback(comments: CommentNode[]): void {
  const seen = new Set<CommentNode>()

  function visit(comment: CommentNode | undefined): void {
    if (!comment || seen.has(comment)) return
    seen.add(comment)

    const assets = extractFileAssets(comment.body)
    if (assets.length > 0) comment.assets = assets
    else delete comment.assets

    for (const child of comment.children?.nodes ?? []) visit(child)
    if (comment.parent && typeof comment.parent === 'object') visit(comment.parent)
  }

  for (const comment of comments) visit(comment)
}

export async function hydrateCommentChildPages(
  client: LinearClient,
  comments: CommentNode[],
  includeArchived?: boolean,
  orderBy?: string,
): Promise<void> {
  for (const comment of comments) {
    if (!comment.id || !comment.children?.pageInfo?.hasNextPage) continue

    const children = comment.children
    let after = children.pageInfo.endCursor ?? undefined
    while (children.pageInfo.hasNextPage) {
      const data = await client.query<{ comments: CommentConnection }>(LIST_COMMENT_CHILDREN_QUERY, {
        filter: { parent: { id: { eq: comment.id } } },
        first: COMMENT_CHILD_PAGE_SIZE,
        after,
        includeArchived,
        orderBy,
      })
      const page = data.comments
      children.nodes.push(...page.nodes)
      children.pageInfo = page.pageInfo
      after = page.pageInfo.endCursor ?? undefined
      if (page.nodes.length === 0) break
    }
  }
  decorateCommentReadback(comments)
}

export async function listFullComments(
  client: LinearClient,
  args: CommentListArgs,
  defaultFirst = DEFAULT_COMMENT_LIMIT,
): Promise<{ comments: CommentConnection }> {
  const limit = normalizeLimit(args.first, defaultFirst)
  const nodes: CommentNode[] = []
  let after = args.after
  let pageInfo: CommentPageInfo = { hasNextPage: false, endCursor: after ?? null }

  while (nodes.length < limit) {
    const first = Math.min(COMMENT_LIST_PAGE_SIZE, limit - nodes.length)
    const data = await client.query<{ comments: CommentConnection }>(LIST_COMMENTS_QUERY, {
      filter: args.filter,
      first,
      after,
      includeArchived: args.includeArchived,
      orderBy: args.orderBy,
    })
    const page = data.comments
    nodes.push(...page.nodes)
    pageInfo = page.pageInfo
    after = pageInfo.endCursor ?? undefined
    if (!pageInfo.hasNextPage || page.nodes.length === 0) break
  }

  await hydrateCommentChildPages(client, nodes, args.includeArchived, args.orderBy)
  return { comments: { pageInfo, nodes } }
}

export async function resolveIssueId(client: LinearClient, id: unknown): Promise<string> {
  const data = await client.query<{ issue: { id: string } }>(GET_ISSUE_COMMENT_TARGET_QUERY, { id })
  return data.issue.id
}

export async function resolveIssueDocumentContentId(client: LinearClient, id: unknown): Promise<string> {
  const data = await client.query<{ issue: { documentContent: { id: string } | null } }>(
    GET_ISSUE_COMMENT_TARGET_QUERY,
    { id },
  )
  const documentContentId = data.issue.documentContent?.id
  if (!documentContentId) throw new Error(`Issue has no document content: ${id}`)
  return documentContentId
}

export async function resolveDocumentContentId(client: LinearClient, id: unknown): Promise<string> {
  const data = await client.query<{ document: { documentContentId: string | null } }>(
    GET_DOCUMENT_COMMENT_TARGET_QUERY,
    { id },
  )
  const documentContentId = data.document.documentContentId
  if (!documentContentId) throw new Error(`Document has no document content: ${id}`)
  return documentContentId
}

export async function resolveProjectDocumentContentId(client: LinearClient, id: unknown): Promise<string> {
  const data = await client.query<{ project: { documentContent: { id: string } | null } }>(
    GET_PROJECT_COMMENT_TARGET_QUERY,
    { id },
  )
  const documentContentId = data.project.documentContent?.id
  if (!documentContentId) throw new Error(`Project has no document content: ${id}`)
  return documentContentId
}

export async function resolveInitiativeDocumentContentId(client: LinearClient, id: unknown): Promise<string> {
  const data = await client.query<{ initiative: { documentContent: { id: string } | null } }>(
    GET_INITIATIVE_COMMENT_TARGET_QUERY,
    { id },
  )
  const documentContentId = data.initiative.documentContent?.id
  if (!documentContentId) throw new Error(`Initiative has no document content: ${id}`)
  return documentContentId
}

export async function buildCommentFilter(
  client: LinearClient,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (args.filter) return args.filter as Record<string, unknown>

  const filter: Record<string, unknown> = {}
  if (args.issueId) filter.issue = { id: { eq: await resolveIssueId(client, args.issueId) } }
  if (args.issueDescriptionId) {
    filter.documentContent = { id: { eq: await resolveIssueDocumentContentId(client, args.issueDescriptionId) } }
  }
  if (args.documentId) {
    filter.documentContent = { id: { eq: await resolveDocumentContentId(client, args.documentId) } }
  }
  if (args.documentContentId) filter.documentContent = { id: { eq: args.documentContentId } }
  if (args.projectContentId) {
    filter.documentContent = { id: { eq: await resolveProjectDocumentContentId(client, args.projectContentId) } }
  }
  if (args.initiativeContentId) {
    filter.documentContent = { id: { eq: await resolveInitiativeDocumentContentId(client, args.initiativeContentId) } }
  }
  if (args.projectId) filter.project = { id: { eq: args.projectId } }
  if (args.initiativeId) filter.initiative = { id: { eq: args.initiativeId } }
  if (args.projectUpdateId) filter.projectUpdate = { id: { eq: args.projectUpdateId } }
  if (args.parentId) filter.parent = { id: { eq: args.parentId } }
  if (args.query) filter.body = { containsIgnoreCase: args.query }

  if (args.initiativeUpdateId || args.postId) {
    throw new Error('Linear CommentFilter does not expose initiativeUpdateId or postId filters. Use get_comment when you have a specific comment ID.')
  }

  return filter
}
