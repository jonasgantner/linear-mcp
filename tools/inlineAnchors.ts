import { randomUUID } from 'node:crypto'
import * as Y from 'yjs'
import { yDocToProsemirrorJSON } from 'y-prosemirror'
import { LinearClient } from '../client.js'

type ProseMirrorNode = {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
  content?: ProseMirrorNode[]
  [key: string]: unknown
}

type InlineAnchorPlan = {
  commentId: string
  target: string
  apply: () => Promise<Record<string, unknown>>
}

const GET_ISSUE_CONTENT_QUERY = `
  query GetIssueInlineAnchorContent($id: String!) {
    issue(id: $id) {
      id identifier descriptionState
      documentContent { id contentState }
    }
  }
`

const GET_DOCUMENT_CONTENT_QUERY = `
  query GetDocumentInlineAnchorContent($id: String!) {
    document(id: $id) {
      id title documentContentId contentState
    }
  }
`

const UPDATE_ISSUE_DESCRIPTION_DATA_MUTATION = `
  mutation UpdateIssueInlineAnchor($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) {
      success
      issue { id identifier documentContent { id contentState } }
    }
  }
`

const UPDATE_DOCUMENT_CONTENT_DATA_MUTATION = `
  mutation UpdateDocumentInlineAnchor($id: String!, $input: DocumentUpdateInput!) {
    documentUpdate(id: $id, input: $input) {
      success
      document { id documentContentId contentState }
    }
  }
`

function prosemirrorFromContentState(contentState: string): ProseMirrorNode {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, Buffer.from(contentState, 'base64'))
  return yDocToProsemirrorJSON(doc) as ProseMirrorNode
}

function inlineCommentMark(commentId: string) {
  return {
    type: 'inlineComment',
    attrs: {
      commentId,
      createdBy: null,
      resolved: false,
      block: false,
    },
  }
}

function withAnchorMark(node: ProseMirrorNode, quotedText: string, commentId: string): { node: ProseMirrorNode; done: boolean } {
  if (node.type === 'text' && typeof node.text === 'string') {
    const index = node.text.indexOf(quotedText)
    if (index >= 0) {
      const before = node.text.slice(0, index)
      const selected = node.text.slice(index, index + quotedText.length)
      const after = node.text.slice(index + quotedText.length)
      const existingMarks = Array.isArray(node.marks) ? node.marks : []
      const marks = [...existingMarks.filter(mark => mark.attrs?.commentId !== commentId), inlineCommentMark(commentId)]
      const replacement: ProseMirrorNode[] = []
      if (before) replacement.push({ ...node, text: before })
      replacement.push({ ...node, text: selected, marks })
      if (after) replacement.push({ ...node, text: after })
      return { node: replacement.length === 1 ? replacement[0] : { type: 'fragment', content: replacement }, done: true }
    }
  }

  if (!Array.isArray(node.content)) return { node, done: false }

  const content: ProseMirrorNode[] = []
  for (let index = 0; index < node.content.length; index += 1) {
    const child = node.content[index]
    const result = withAnchorMark(child, quotedText, commentId)
    if (result.done) {
      if (result.node.type === 'fragment' && Array.isArray(result.node.content)) {
        content.push(...result.node.content)
      } else {
        content.push(result.node)
      }
      content.push(...node.content.slice(index + 1))
      return { node: { ...node, content }, done: true }
    }
    content.push(result.node)
  }

  return { node: { ...node, content }, done: false }
}

function patchContentState(contentState: string, quotedText: string, commentId: string): ProseMirrorNode {
  const prosemirror = prosemirrorFromContentState(contentState)
  const result = withAnchorMark(prosemirror, quotedText, commentId)
  if (!result.done) {
    throw new Error(`Quoted text was not found in one text span. Quote must match current rich text exactly: ${quotedText}`)
  }
  return result.node
}

function quotedTextFromArgs(args: Record<string, unknown>): string | null {
  const quotedText = args.quotedText
  if (typeof quotedText !== 'string') return null
  const trimmed = quotedText.trim()
  return trimmed.length > 0 ? quotedText : null
}

export async function prepareInlineAnchor(
  client: LinearClient,
  args: Record<string, unknown>,
): Promise<InlineAnchorPlan | null> {
  const quotedText = quotedTextFromArgs(args)
  if (!quotedText) return null

  const commentId = randomUUID()

  if (args.issueDescriptionId) {
    const data = await client.query<{
      issue: { id: string; identifier: string; descriptionState: string | null; documentContent: { id: string; contentState: string | null } | null }
    }>(GET_ISSUE_CONTENT_QUERY, { id: args.issueDescriptionId })
    const contentState = data.issue.documentContent?.contentState ?? data.issue.descriptionState
    if (!contentState) throw new Error(`Issue has no rich description state: ${args.issueDescriptionId}`)
    const descriptionData = patchContentState(contentState, quotedText, commentId)
    return {
      commentId,
      target: `issueDescription:${data.issue.identifier}`,
      apply: () => client.query(UPDATE_ISSUE_DESCRIPTION_DATA_MUTATION, {
        id: data.issue.id,
        input: { descriptionData },
      }),
    }
  }

  if (args.documentId) {
    const data = await client.query<{
      document: { id: string; title: string; documentContentId: string | null; contentState: string | null }
    }>(GET_DOCUMENT_CONTENT_QUERY, { id: args.documentId })
    if (!data.document.contentState) throw new Error(`Document has no rich content state: ${args.documentId}`)
    const contentData = patchContentState(data.document.contentState, quotedText, commentId)
    return {
      commentId,
      target: `document:${data.document.id}`,
      apply: () => client.query(UPDATE_DOCUMENT_CONTENT_DATA_MUTATION, {
        id: data.document.id,
        input: { contentData },
      }),
    }
  }

  if (args.projectContentId || args.initiativeContentId) {
    throw new Error('quotedText on projectContentId/initiativeContentId would create a detached quote card: Linear does not expose a contentData update path for project or initiative rich content. Use projectId/initiativeId for normal comments, or omit quotedText.')
  }

  if (args.documentContentId) {
    throw new Error('quotedText with documentContentId creates a detached quote card because Linear anchors must also update the owning rich-text object. Use issueDescriptionId, documentId, projectContentId, or initiativeContentId instead.')
  }

  return null
}
