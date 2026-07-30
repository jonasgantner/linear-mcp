export type FileAsset = {
  type: 'image' | 'file' | 'upload'
  source: 'markdown-image' | 'markdown-link' | 'bare-url'
  label: string | null
  url: string
  fileName: string | null
  extension: string | null
}

const IMAGE_EXTENSIONS = new Set(['bmp', 'gif', 'heic', 'jpeg', 'jpg', 'png', 'svg', 'webp'])
const MARKDOWN_LINK_PATTERN = /(!?)\[([^\]\n]*)\]\((<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\)/g
const BARE_UPLOAD_URL_PATTERN = /https:\/\/uploads\.linear\.app\/[^\s)<\]]+/g

function cleanUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim()
  const unwrapped = trimmed.startsWith('<') && trimmed.endsWith('>') ? trimmed.slice(1, -1) : trimmed
  return unwrapped.replace(/[.,;!?]+$/g, '')
}

function fileNameFromUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname
    const name = path.split('/').filter(Boolean).pop()
    return name ? decodeURIComponent(name) : null
  } catch {
    return null
  }
}

function extensionFromFileName(fileName: string | null): string | null {
  const match = fileName?.match(/\.([a-zA-Z0-9]{1,12})$/)
  return match ? match[1].toLowerCase() : null
}

function isLinearUpload(url: string): boolean {
  try {
    return new URL(url).hostname === 'uploads.linear.app'
  } catch {
    return false
  }
}

function assetType(source: FileAsset['source'], url: string, extension: string | null): FileAsset['type'] {
  if (source === 'markdown-image' || (extension && IMAGE_EXTENSIONS.has(extension))) return 'image'
  if (extension) return 'file'
  return isLinearUpload(url) ? 'upload' : 'file'
}

function buildAsset(
  source: FileAsset['source'],
  rawLabel: string | null,
  rawUrl: string,
): FileAsset | null {
  const url = cleanUrl(rawUrl)
  const label = rawLabel?.trim() || null
  const urlFileName = fileNameFromUrl(url)
  const fileName = extensionFromFileName(label) ? label : urlFileName
  const extension = extensionFromFileName(fileName)
  if (source === 'markdown-link' && !extension && !isLinearUpload(url)) return null
  return {
    type: assetType(source, url, extension),
    source,
    label,
    url,
    fileName,
    extension,
  }
}

export function extractFileAssets(markdown: unknown): FileAsset[] {
  if (typeof markdown !== 'string' || markdown.length === 0) return []

  const assets: FileAsset[] = []
  const seenUrls = new Set<string>()
  for (const match of markdown.matchAll(MARKDOWN_LINK_PATTERN)) {
    const source: FileAsset['source'] = match[1] === '!' ? 'markdown-image' : 'markdown-link'
    const asset = buildAsset(source, match[2] ?? null, match[3] ?? '')
    if (!asset || seenUrls.has(asset.url)) continue
    seenUrls.add(asset.url)
    assets.push(asset)
  }

  for (const match of markdown.matchAll(BARE_UPLOAD_URL_PATTERN)) {
    const asset = buildAsset('bare-url', null, match[0])
    if (!asset || seenUrls.has(asset.url)) continue
    seenUrls.add(asset.url)
    assets.push(asset)
  }

  return assets
}
