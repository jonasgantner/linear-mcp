import { LinearClient } from '../client.js'

export const COMMENT_CHILD_FIELDS = `
  id body quotedText url
  issueId projectId initiativeId documentContentId projectUpdateId initiativeUpdateId parentId resolvingCommentId
  user { id name }
  resolvingUser { id name }
  createdAt updatedAt editedAt archivedAt resolvedAt
`

export const COMMENT_READ_FIELDS = `
  ${COMMENT_CHILD_FIELDS}
  parent { ${COMMENT_CHILD_FIELDS} }
  children(first: 50) {
    pageInfo { hasNextPage endCursor }
    nodes { ${COMMENT_CHILD_FIELDS} }
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
