import { LinearClient } from '../client.js'

export const COMMENT_TARGET_PROPS = {
  issueId: { type: 'string', description: 'Issue UUID or identifier (comment on issue)' },
  projectUpdateId: { type: 'string', description: 'Project update UUID (reply to project update)' },
  initiativeUpdateId: { type: 'string', description: 'Initiative update UUID (reply to initiative update)' },
  projectId: { type: 'string', description: 'Project UUID (direct project comment)' },
  initiativeId: { type: 'string', description: 'Initiative UUID (direct initiative comment)' },
  documentContentId: { type: 'string', description: 'DocumentContent UUID (content comment; use parent targets with quotedText for GUI highlights)' },
  documentId: { type: 'string', description: 'Document UUID (resolves to documentContentId)' },
  issueDescriptionId: { type: 'string', description: 'Issue UUID or identifier whose description content should be commented on' },
  projectContentId: { type: 'string', description: 'Project UUID whose rich content should be commented on (quotedText source anchors are not supported by Linear API)' },
  initiativeContentId: { type: 'string', description: 'Initiative UUID whose rich content should be commented on (quotedText source anchors are not supported by Linear API)' },
  postId: { type: 'string', description: 'Post UUID' },
} as const

export const COMMENT_TARGET_NAMES = [
  'issueId',
  'projectUpdateId',
  'initiativeUpdateId',
  'projectId',
  'initiativeId',
  'documentContentId',
  'documentId',
  'issueDescriptionId',
  'projectContentId',
  'initiativeContentId',
  'postId',
] as const

const GET_ISSUE_DOCUMENT_CONTENT_QUERY = `
  query GetIssueDocumentContent($id: String!) {
    issue(id: $id) { id identifier documentContent { id } }
  }
`

const GET_DOCUMENT_CONTENT_ID_QUERY = `
  query GetDocumentContentId($id: String!) {
    document(id: $id) { id title documentContentId }
  }
`

const GET_PROJECT_DOCUMENT_CONTENT_QUERY = `
  query GetProjectDocumentContent($id: String!) {
    project(id: $id) { id name documentContent { id } }
  }
`

const GET_INITIATIVE_DOCUMENT_CONTENT_QUERY = `
  query GetInitiativeDocumentContent($id: String!) {
    initiative(id: $id) { id name documentContent { id } }
  }
`

function valueCount(args: Record<string, unknown>): number {
  return COMMENT_TARGET_NAMES.filter(name => Boolean(args[name])).length
}

export async function buildCommentCreateInput(
  client: LinearClient,
  args: Record<string, unknown>,
  body: string,
): Promise<Record<string, unknown>> {
  const count = valueCount(args)
  if (count !== 1) {
    throw new Error(`Provide exactly one comment target: ${COMMENT_TARGET_NAMES.join(', ')}`)
  }

  let documentContentId = args.documentContentId as string | undefined
  if (args.issueDescriptionId) {
    const data = await client.query<{
      issue: { documentContent: { id: string } | null }
    }>(GET_ISSUE_DOCUMENT_CONTENT_QUERY, { id: args.issueDescriptionId })
    documentContentId = data.issue.documentContent?.id
    if (!documentContentId) throw new Error(`Issue has no document content: ${args.issueDescriptionId}`)
  }
  if (args.documentId) {
    const data = await client.query<{
      document: { documentContentId: string | null }
    }>(GET_DOCUMENT_CONTENT_ID_QUERY, { id: args.documentId })
    documentContentId = data.document.documentContentId ?? undefined
    if (!documentContentId) throw new Error(`Document has no document content: ${args.documentId}`)
  }
  if (args.projectContentId) {
    const data = await client.query<{
      project: { documentContent: { id: string } | null }
    }>(GET_PROJECT_DOCUMENT_CONTENT_QUERY, { id: args.projectContentId })
    documentContentId = data.project.documentContent?.id
    if (!documentContentId) throw new Error(`Project has no document content: ${args.projectContentId}`)
  }
  if (args.initiativeContentId) {
    const data = await client.query<{
      initiative: { documentContent: { id: string } | null }
    }>(GET_INITIATIVE_DOCUMENT_CONTENT_QUERY, { id: args.initiativeContentId })
    documentContentId = data.initiative.documentContent?.id
    if (!documentContentId) throw new Error(`Initiative has no document content: ${args.initiativeContentId}`)
  }

  const input: Record<string, unknown> = {
    body,
    issueId: args.issueId,
    projectUpdateId: args.projectUpdateId,
    initiativeUpdateId: args.initiativeUpdateId,
    projectId: args.projectId,
    initiativeId: args.initiativeId,
    documentContentId,
    postId: args.postId,
    parentId: args.parentId,
    quotedText: args.quotedText,
    bodyData: args.bodyData,
  }

  for (const key of Object.keys(input)) {
    if (input[key] === undefined) delete input[key]
  }
  return input
}
