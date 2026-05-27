import { basename, isAbsolute } from 'node:path'
import { readFile, stat } from 'node:fs/promises'
import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'
import { COMMENT_TARGET_PROPS, buildCommentCreateInput } from './commentTargets.js'
import { prepareInlineAnchor } from './inlineAnchors.js'

type UploadFileHeader = { key: string; value: string }
type UploadFile = {
  filename: string
  contentType: string
  size: number
  uploadUrl: string
  assetUrl: string
  metaData?: unknown
  headers: UploadFileHeader[]
}
type UploadResult = {
  path?: string
  filename: string
  storageFilename?: string
  contentType: string
  size: number
  assetUrl: string
  markdown: string
  metaData?: unknown
}

const UPLOAD_FILE_MUTATION = `
  mutation UploadFile($filename: String!, $contentType: String!, $size: Int!, $makePublic: Boolean, $metaData: JSON) {
    fileUpload(filename: $filename, contentType: $contentType, size: $size, makePublic: $makePublic, metaData: $metaData) {
      success
      uploadFile {
        filename contentType size uploadUrl assetUrl metaData
        headers { key value }
      }
    }
  }
`

const IMAGE_UPLOAD_FROM_URL_MUTATION = `
  mutation ImageUploadFromUrl($url: String!) {
    imageUploadFromUrl(url: $url) {
      success
      url
    }
  }
`

const CREATE_COMMENT_MUTATION = `
  mutation CreateComment($input: CommentCreateInput!) {
    commentCreate(input: $input) {
      success
      comment {
        id body quotedText url
        issueId projectId initiativeId documentContentId projectUpdateId initiativeUpdateId parentId
        user { name }
        createdAt
      }
    }
  }
`

const GET_ISSUE_DESCRIPTION_QUERY = `
  query GetIssueDescription($id: String!) {
    issue(id: $id) { id identifier title description }
  }
`

const UPDATE_ISSUE_DESCRIPTION_MUTATION = `
  mutation UpdateIssueDescription($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) {
      success
      issue { id identifier title url description }
    }
  }
`

const CREATE_DOCUMENT_MUTATION = `
  mutation CreateDocument($input: DocumentCreateInput!) {
    documentCreate(input: $input) {
      success
      document { id title icon color url }
    }
  }
`

const GET_DOCUMENT_CONTENT_QUERY = `
  query GetDocumentContent($id: String!) {
    document(id: $id) { id title content }
  }
`

const UPDATE_DOCUMENT_MUTATION = `
  mutation UpdateDocument($id: String!, $input: DocumentUpdateInput!) {
    documentUpdate(id: $id, input: $input) {
      success
      document { id title icon color url }
    }
  }
`

const GET_PROJECT_CONTENT_QUERY = `
  query GetProjectContent($id: String!) {
    project(id: $id) { id name content }
  }
`

const UPDATE_PROJECT_CONTENT_MUTATION = `
  mutation UpdateProjectContent($id: String!, $input: ProjectUpdateInput!) {
    projectUpdate(id: $id, input: $input) {
      success
      project { id name url content }
    }
  }
`

const CREATE_PROJECT_UPDATE_MUTATION = `
  mutation CreateProjectUpdate($input: ProjectUpdateCreateInput!) {
    projectUpdateCreate(input: $input) {
      success
      projectUpdate { id body health createdAt user { name } }
    }
  }
`

const GET_INITIATIVE_CONTENT_QUERY = `
  query GetInitiativeContent($id: String!) {
    initiative(id: $id) { id name content }
  }
`

const UPDATE_INITIATIVE_CONTENT_MUTATION = `
  mutation UpdateInitiativeContent($id: String!, $input: InitiativeUpdateInput!) {
    initiativeUpdate(id: $id, input: $input) {
      success
      initiative { id name status color }
    }
  }
`

const CREATE_INITIATIVE_UPDATE_MUTATION = `
  mutation CreateInitiativeUpdate($input: InitiativeUpdateCreateInput!) {
    initiativeUpdateCreate(input: $input) {
      success
      initiativeUpdate { id body health createdAt }
    }
  }
`

const MIME_BY_EXT: Record<string, string> = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.zip': 'application/zip',
}

function inferContentType(path: string): string {
  const dot = path.lastIndexOf('.')
  if (dot === -1) return 'application/octet-stream'
  return MIME_BY_EXT[path.slice(dot).toLowerCase()] ?? 'application/octet-stream'
}

function escapeMarkdownLabel(label: string): string {
  return label.replace(/\\/g, '\\\\').replace(/\]/g, '\\]').replace(/\[/g, '\\[').replace(/\r?\n/g, ' ')
}

function markdownForUpload(upload: Pick<UploadResult, 'filename' | 'contentType' | 'assetUrl'>, embedImages = true): string {
  const filename = escapeMarkdownLabel(upload.filename)
  if (embedImages && upload.contentType.startsWith('image/')) {
    return `![${filename}](${upload.assetUrl})`
  }
  return `[${filename}](${upload.assetUrl})`
}

function appendMarkdown(existing: string | null | undefined, addition: string): string {
  const trimmed = existing?.trimEnd() ?? ''
  if (!trimmed) return addition
  return `${trimmed}\n\n${addition}`
}

async function requestUpload(
  client: LinearClient,
  input: {
    filename: string
    contentType: string
    size: number
    makePublic?: boolean
    metaData?: unknown
  },
): Promise<UploadFile> {
  const data = await client.query<{
    fileUpload: { success: boolean; uploadFile: UploadFile | null }
  }>(UPLOAD_FILE_MUTATION, input)
  const upload = data.fileUpload.uploadFile
  if (!data.fileUpload.success || !upload) {
    throw new Error('Linear did not return a signed upload URL')
  }
  return upload
}

async function putUpload(upload: UploadFile, bytes: Uint8Array): Promise<void> {
  const headers = new Headers()
  headers.set('Content-Type', upload.contentType)
  headers.set('Cache-Control', 'public, max-age=31536000')
  for (const header of upload.headers) headers.set(header.key, header.value)

  const res = await fetch(upload.uploadUrl, {
    method: 'PUT',
    headers,
    body: bytes,
  })
  if (!res.ok) {
    throw new Error(`Linear storage upload failed: ${res.status} ${await res.text()}`)
  }
}

async function uploadLocalFile(
  client: LinearClient,
  path: string,
  options: {
    filename?: string
    contentType?: string
    makePublic?: boolean
    metaData?: unknown
    embedImages?: boolean
  } = {},
): Promise<UploadResult> {
  if (!isAbsolute(path)) throw new Error(`File path must be absolute: ${path}`)
  const info = await stat(path)
  if (!info.isFile()) throw new Error(`Path is not a regular file: ${path}`)
  const filename = options.filename || basename(path)
  const contentType = options.contentType || inferContentType(filename)
  const bytes = await readFile(path)
  const upload = await requestUpload(client, {
    filename,
    contentType,
    size: info.size,
    makePublic: options.makePublic,
    metaData: options.metaData,
  })
  await putUpload(upload, bytes)
  const displayUpload = {
    filename,
    contentType: upload.contentType,
    assetUrl: upload.assetUrl,
  }
  return {
    path,
    filename,
    storageFilename: upload.filename,
    contentType: upload.contentType,
    size: upload.size,
    assetUrl: upload.assetUrl,
    markdown: markdownForUpload(displayUpload, options.embedImages ?? true),
    metaData: upload.metaData,
  }
}

async function uploadPaths(
  client: LinearClient,
  paths: string[],
  options: {
    makePublic?: boolean
    metaData?: unknown
    embedImages?: boolean
  } = {},
): Promise<UploadResult[]> {
  if (!Array.isArray(paths) || paths.length === 0) throw new Error('At least one file path is required')
  const results: UploadResult[] = []
  for (const path of paths) {
    results.push(await uploadLocalFile(client, path, options))
  }
  return results
}

function uploadsMarkdown(uploads: UploadResult[]): string {
  return uploads.map(upload => upload.markdown).join('\n\n')
}

export const fileTools: ToolDef[] = [
  {
    name: 'upload_file',
    description: 'Upload one local file to Linear private storage using fileUpload + signed PUT. Returns assetUrl and markdown. This is distinct from URL/resource attachments.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        path: { type: 'string', description: 'Absolute local file path to upload' },
        filename: { type: 'string', description: 'Optional filename override' },
        contentType: { type: 'string', description: 'Optional MIME type override. Defaults from extension.' },
        makePublic: { type: 'boolean', description: 'Optional Linear fileUpload makePublic flag' },
        metaData: { type: 'object', description: 'Optional Linear fileUpload metadata JSON' },
        embedImages: { type: 'boolean', description: 'Return image markdown for image/* files. Default true.' },
      },
      required: ['path'],
    },
    examples: [
      {
        title: 'Upload local PDF',
        description: 'Use file upload tools for local binary files; the result includes markdown to paste into descriptions/comments/documents.',
        args: { workspace: 'personal', path: '/absolute/path/report.pdf', makePublic: false },
      },
      {
        title: 'Upload image with markdown',
        args: { workspace: 'personal', path: '/absolute/path/screenshot.png', embedImages: true },
      },
    ],
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const upload = await uploadLocalFile(client, args.path as string, {
        filename: args.filename as string | undefined,
        contentType: args.contentType as string | undefined,
        makePublic: args.makePublic as boolean | undefined,
        metaData: args.metaData,
        embedImages: args.embedImages as boolean | undefined,
      })
      return JSON.stringify({ upload }, null, 2)
    },
  },
  {
    name: 'upload_image_from_url',
    description: 'Ask Linear to upload an image from a public URL into Linear storage. Returns assetUrl and markdown.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        url: { type: 'string', description: 'Public image URL' },
        embedImages: { type: 'boolean', description: 'Return image markdown for image/* files. Default true.' },
      },
      required: ['url'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query<{
        imageUploadFromUrl: { success: boolean; url: string | null }
      }>(IMAGE_UPLOAD_FROM_URL_MUTATION, { url: args.url })
      const assetUrl = data.imageUploadFromUrl.url
      if (!data.imageUploadFromUrl.success || !assetUrl) {
        throw new Error('Linear did not return an uploaded image URL')
      }
      const filename = assetUrl.split('/').pop() || 'image'
      const result: UploadResult = {
        filename,
        contentType: 'image/*',
        size: 0,
        assetUrl,
        markdown: markdownForUpload({ filename, contentType: 'image/*', assetUrl }, (args.embedImages as boolean | undefined) ?? true),
      }
      return JSON.stringify({ upload: result }, null, 2)
    },
  },
  {
    name: 'create_comment_with_files',
    description: 'Upload local files and create a Linear comment containing their markdown links/assets. Provide exactly one comment target. Use issueDescriptionId/documentId with quotedText to create a real inline source anchor.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        body: { type: 'string', description: 'Optional comment body before uploaded file links' },
        paths: { type: 'array', items: { type: 'string' }, description: 'Absolute local file paths to upload' },
        ...COMMENT_TARGET_PROPS,
        parentId: { type: 'string', description: 'Parent comment UUID for threaded reply' },
        quotedText: { type: 'string', description: 'Exact selected text for inline comments. Use a parent content target, not raw documentContentId, when a GUI highlight is needed.' },
        bodyData: { type: 'object', description: 'Optional Linear rich-text bodyData JSON. Omit for normal markdown body.' },
        makePublic: { type: 'boolean', description: 'Optional Linear fileUpload makePublic flag' },
        metaData: { type: 'object', description: 'Optional metadata applied to each upload' },
        embedImages: { type: 'boolean', description: 'Embed images as markdown images. Default true.' },
      },
      required: ['paths'],
    },
    examples: [
      {
        title: 'Issue comment with files',
        args: { workspace: 'personal', issueId: 'J-559', body: 'Attached verification output.', paths: ['/absolute/path/report.md', '/absolute/path/screenshot.png'] },
      },
      {
        title: 'Inline comment with files',
        description: 'Use issueDescriptionId/documentId plus quotedText for GUI-highlighted anchors.',
        args: { workspace: 'personal', issueDescriptionId: 'J-559', quotedText: 'CAPABILITIES.md', body: 'Rendered output attached.', paths: ['/absolute/path/capabilities-diff.txt'] },
      },
    ],
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const inlineAnchor = await prepareInlineAnchor(client, args)
      const uploads = await uploadPaths(client, args.paths as string[], {
        makePublic: args.makePublic as boolean | undefined,
        metaData: args.metaData,
        embedImages: args.embedImages as boolean | undefined,
      })
      const body = appendMarkdown(args.body as string | undefined, uploadsMarkdown(uploads))
      const input = await buildCommentCreateInput(client, args, body)
      if (inlineAnchor) input.id = inlineAnchor.commentId
      const data = await client.query(CREATE_COMMENT_MUTATION, {
        input,
      })
      if (!inlineAnchor) return JSON.stringify({ ...data as object, uploads }, null, 2)
      const anchorResult = await inlineAnchor.apply()
      return JSON.stringify({ ...data as object, uploads, inlineAnchor: { target: inlineAnchor.target, result: anchorResult } }, null, 2)
    },
  },
  {
    name: 'append_issue_files',
    description: 'Upload local files and append their markdown links/assets to an issue description.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        issueId: { type: 'string', description: 'Issue UUID or identifier' },
        paths: { type: 'array', items: { type: 'string' }, description: 'Absolute local file paths to upload' },
        heading: { type: 'string', description: 'Optional heading before uploaded file links' },
        makePublic: { type: 'boolean', description: 'Optional Linear fileUpload makePublic flag' },
        metaData: { type: 'object', description: 'Optional metadata applied to each upload' },
        embedImages: { type: 'boolean', description: 'Embed images as markdown images. Default true.' },
      },
      required: ['issueId', 'paths'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const uploads = await uploadPaths(client, args.paths as string[], {
        makePublic: args.makePublic as boolean | undefined,
        metaData: args.metaData,
        embedImages: args.embedImages as boolean | undefined,
      })
      const current = await client.query<{
        issue: { description: string | null }
      }>(GET_ISSUE_DESCRIPTION_QUERY, { id: args.issueId })
      const addition = appendMarkdown(args.heading as string | undefined, uploadsMarkdown(uploads))
      const description = appendMarkdown(current.issue.description, addition)
      const data = await client.query(UPDATE_ISSUE_DESCRIPTION_MUTATION, {
        id: args.issueId,
        input: { description },
      })
      return JSON.stringify({ ...data as object, uploads }, null, 2)
    },
  },
  {
    name: 'append_project_files',
    description: 'Upload local files and append their markdown links/assets to a project rich content field.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        projectId: { type: 'string', description: 'Project UUID' },
        paths: { type: 'array', items: { type: 'string' }, description: 'Absolute local file paths to upload' },
        heading: { type: 'string', description: 'Optional heading before uploaded file links' },
        makePublic: { type: 'boolean', description: 'Optional Linear fileUpload makePublic flag' },
        metaData: { type: 'object', description: 'Optional metadata applied to each upload' },
        embedImages: { type: 'boolean', description: 'Embed images as markdown images. Default true.' },
      },
      required: ['projectId', 'paths'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const uploads = await uploadPaths(client, args.paths as string[], {
        makePublic: args.makePublic as boolean | undefined,
        metaData: args.metaData,
        embedImages: args.embedImages as boolean | undefined,
      })
      const current = await client.query<{
        project: { content: string | null }
      }>(GET_PROJECT_CONTENT_QUERY, { id: args.projectId })
      const addition = appendMarkdown(args.heading as string | undefined, uploadsMarkdown(uploads))
      const content = appendMarkdown(current.project.content, addition)
      const data = await client.query(UPDATE_PROJECT_CONTENT_MUTATION, {
        id: args.projectId,
        input: { content },
      })
      return JSON.stringify({ ...data as object, uploads }, null, 2)
    },
  },
  {
    name: 'append_initiative_files',
    description: 'Upload local files and append their markdown links/assets to an initiative rich content field.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        initiativeId: { type: 'string', description: 'Initiative UUID' },
        paths: { type: 'array', items: { type: 'string' }, description: 'Absolute local file paths to upload' },
        heading: { type: 'string', description: 'Optional heading before uploaded file links' },
        makePublic: { type: 'boolean', description: 'Optional Linear fileUpload makePublic flag' },
        metaData: { type: 'object', description: 'Optional metadata applied to each upload' },
        embedImages: { type: 'boolean', description: 'Embed images as markdown images. Default true.' },
      },
      required: ['initiativeId', 'paths'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const uploads = await uploadPaths(client, args.paths as string[], {
        makePublic: args.makePublic as boolean | undefined,
        metaData: args.metaData,
        embedImages: args.embedImages as boolean | undefined,
      })
      const current = await client.query<{
        initiative: { content: string | null }
      }>(GET_INITIATIVE_CONTENT_QUERY, { id: args.initiativeId })
      const addition = appendMarkdown(args.heading as string | undefined, uploadsMarkdown(uploads))
      const content = appendMarkdown(current.initiative.content, addition)
      const data = await client.query(UPDATE_INITIATIVE_CONTENT_MUTATION, {
        id: args.initiativeId,
        input: { content },
      })
      return JSON.stringify({ ...data as object, uploads }, null, 2)
    },
  },
  {
    name: 'create_project_update_with_files',
    description: 'Upload local files and create a project status update containing their markdown links/assets.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        projectId: { type: 'string', description: 'Project UUID' },
        body: { type: 'string', description: 'Optional update body before uploaded file links' },
        health: { type: 'string', description: 'Health status: onTrack, atRisk, or offTrack' },
        paths: { type: 'array', items: { type: 'string' }, description: 'Absolute local file paths to upload' },
        makePublic: { type: 'boolean', description: 'Optional Linear fileUpload makePublic flag' },
        metaData: { type: 'object', description: 'Optional metadata applied to each upload' },
        embedImages: { type: 'boolean', description: 'Embed images as markdown images. Default true.' },
      },
      required: ['projectId', 'paths'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const uploads = await uploadPaths(client, args.paths as string[], {
        makePublic: args.makePublic as boolean | undefined,
        metaData: args.metaData,
        embedImages: args.embedImages as boolean | undefined,
      })
      const body = appendMarkdown(args.body as string | undefined, uploadsMarkdown(uploads))
      const data = await client.query(CREATE_PROJECT_UPDATE_MUTATION, {
        input: {
          projectId: args.projectId,
          body,
          health: args.health,
        },
      })
      return JSON.stringify({ ...data as object, uploads }, null, 2)
    },
  },
  {
    name: 'create_initiative_update_with_files',
    description: 'Upload local files and create an initiative status update containing their markdown links/assets.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        initiativeId: { type: 'string', description: 'Initiative UUID' },
        body: { type: 'string', description: 'Optional update body before uploaded file links' },
        health: { type: 'string', description: 'Health: onTrack, atRisk, or offTrack' },
        paths: { type: 'array', items: { type: 'string' }, description: 'Absolute local file paths to upload' },
        makePublic: { type: 'boolean', description: 'Optional Linear fileUpload makePublic flag' },
        metaData: { type: 'object', description: 'Optional metadata applied to each upload' },
        embedImages: { type: 'boolean', description: 'Embed images as markdown images. Default true.' },
      },
      required: ['initiativeId', 'paths'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const uploads = await uploadPaths(client, args.paths as string[], {
        makePublic: args.makePublic as boolean | undefined,
        metaData: args.metaData,
        embedImages: args.embedImages as boolean | undefined,
      })
      const body = appendMarkdown(args.body as string | undefined, uploadsMarkdown(uploads))
      const data = await client.query(CREATE_INITIATIVE_UPDATE_MUTATION, {
        input: {
          initiativeId: args.initiativeId,
          body,
          health: args.health,
        },
      })
      return JSON.stringify({ ...data as object, uploads }, null, 2)
    },
  },
  {
    name: 'create_document_with_files',
    description: 'Upload local files and create a Linear document containing their markdown links/assets.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        title: { type: 'string', description: 'Document title' },
        content: { type: 'string', description: 'Optional document markdown before uploaded file links' },
        paths: { type: 'array', items: { type: 'string' }, description: 'Absolute local file paths to upload' },
        icon: { type: 'string', description: 'Linear icon name (e.g. "Health")' },
        color: { type: 'string', description: 'Color hex' },
        projectId: { type: 'string', description: 'Link to project UUID' },
        initiativeId: { type: 'string', description: 'Link to initiative UUID' },
        teamId: { type: 'string', description: 'Link to team UUID' },
        makePublic: { type: 'boolean', description: 'Optional Linear fileUpload makePublic flag' },
        metaData: { type: 'object', description: 'Optional metadata applied to each upload' },
        embedImages: { type: 'boolean', description: 'Embed images as markdown images. Default true.' },
      },
      required: ['title', 'paths'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const uploads = await uploadPaths(client, args.paths as string[], {
        makePublic: args.makePublic as boolean | undefined,
        metaData: args.metaData,
        embedImages: args.embedImages as boolean | undefined,
      })
      const content = appendMarkdown(args.content as string | undefined, uploadsMarkdown(uploads))
      const data = await client.query(CREATE_DOCUMENT_MUTATION, {
        input: {
          title: args.title,
          content,
          icon: args.icon,
          color: args.color,
          projectId: args.projectId,
          initiativeId: args.initiativeId,
          teamId: args.teamId,
        },
      })
      return JSON.stringify({ ...data as object, uploads }, null, 2)
    },
  },
  {
    name: 'update_document_with_files',
    description: 'Upload local files and append their markdown links/assets to an existing Linear document.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Document UUID' },
        content: { type: 'string', description: 'Optional markdown before uploaded file links' },
        paths: { type: 'array', items: { type: 'string' }, description: 'Absolute local file paths to upload' },
        makePublic: { type: 'boolean', description: 'Optional Linear fileUpload makePublic flag' },
        metaData: { type: 'object', description: 'Optional metadata applied to each upload' },
        embedImages: { type: 'boolean', description: 'Embed images as markdown images. Default true.' },
      },
      required: ['id', 'paths'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const uploads = await uploadPaths(client, args.paths as string[], {
        makePublic: args.makePublic as boolean | undefined,
        metaData: args.metaData,
        embedImages: args.embedImages as boolean | undefined,
      })
      const current = await client.query<{
        document: { content: string | null }
      }>(GET_DOCUMENT_CONTENT_QUERY, { id: args.id })
      const addition = appendMarkdown(args.content as string | undefined, uploadsMarkdown(uploads))
      const content = appendMarkdown(current.document.content, addition)
      const data = await client.query(UPDATE_DOCUMENT_MUTATION, {
        id: args.id,
        input: { content },
      })
      return JSON.stringify({ ...data as object, uploads }, null, 2)
    },
  },
]
