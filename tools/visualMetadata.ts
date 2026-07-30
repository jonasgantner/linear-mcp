import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ToolDef } from './_types.js'

type VisualMetadataRegistry = {
  testedAt: string
  icon: {
    syntax: string
    acceptedDecorative: string[]
    rejectedDecorative: string[]
    renderAliases: Record<string, string>
  }
  emoji: {
    syntax: string
    colonNames: string[]
    names: string[]
    symbols: Array<{ name: string; symbol: string }>
    rejectedSyntaxes: string[]
  }
  color: {
    syntax: string
    portableRegex: string
    acceptedExamples: string[]
    rejectedExamples: string[]
    notes: string[]
  }
}

const registryPath = fileURLToPath(new URL('../references/linear-visual-metadata.json', import.meta.url))
const visualMetadata = JSON.parse(readFileSync(registryPath, 'utf8')) as VisualMetadataRegistry

const decorativeIconNames = new Set(visualMetadata.icon.acceptedDecorative)
const rejectedDecorativeIconNames = new Set(visualMetadata.icon.rejectedDecorative)
const emojiShortcodes = new Set(visualMetadata.emoji.colonNames)
const emojiNameToShortcode = new Map(visualMetadata.emoji.names.map(name => [name, `:${name}:`]))
const emojiSymbolToShortcode = new Map(
  visualMetadata.emoji.symbols.map(({ name, symbol }) => [symbol, `:${name}:`]),
)
const renderAliasToApiName = new Map(
  Object.entries(visualMetadata.icon.renderAliases).map(([apiName, renderAlias]) => [renderAlias, apiName]),
)
const lowerDecorativeIconNameToExact = new Map(
  visualMetadata.icon.acceptedDecorative.map(name => [name.toLowerCase(), name]),
)
const HEX_COLOR_RE = /^#?(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/

export const LINEAR_VISUAL_ICON_DESCRIPTION =
  'Linear visual icon: accepted decorative PascalCase registry name (e.g. "Health", "Rocket", "Briefcase") or emoji colon shortcode (e.g. ":foot:"). Raw emoji names and Unicode symbols are rejected.'

export const LINEAR_VISUAL_COLOR_DESCRIPTION =
  'Hex color only: "#RRGGBB", "#RGB", or six hex digits. Avoid RGB/HSL/CSS names/CSS vars/GUI preset labels.'

function optionalStringField(fieldName: 'icon' | 'color', value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value !== 'string') {
    throw new Error(`Linear ${fieldName} must be a string, null, or omitted.`)
  }
  if (value.trim() === '') {
    throw new Error(`Linear ${fieldName} cannot be an empty string. Omit it, pass null to clear it, or use a valid value.`)
  }
  return value
}

export function assertValidLinearIcon(value: unknown): void {
  const icon = optionalStringField('icon', value)
  if (icon === undefined) return

  if (decorativeIconNames.has(icon) || emojiShortcodes.has(icon)) return

  const shortcodeForName = emojiNameToShortcode.get(icon)
  if (shortcodeForName) {
    throw new Error(`Invalid Linear icon "${icon}". Raw emoji names are rejected by Linear's API; use "${shortcodeForName}".`)
  }

  const shortcodeForSymbol = emojiSymbolToShortcode.get(icon)
  if (shortcodeForSymbol) {
    throw new Error(`Invalid Linear icon "${icon}". Raw Unicode emoji symbols are rejected by Linear's API; use "${shortcodeForSymbol}".`)
  }

  const apiNameForAlias = renderAliasToApiName.get(icon)
  if (apiNameForAlias) {
    throw new Error(`Invalid Linear icon "${icon}". That is a frontend render alias; use API value "${apiNameForAlias}".`)
  }

  const exactCasing = lowerDecorativeIconNameToExact.get(icon.toLowerCase())
  if (exactCasing) {
    throw new Error(`Invalid Linear icon "${icon}". Icon names are case-sensitive; use "${exactCasing}".`)
  }

  if (rejectedDecorativeIconNames.has(icon)) {
    throw new Error(`Invalid Linear icon "${icon}". This frontend decorative name was probed on ${visualMetadata.testedAt} and rejected by Linear's API.`)
  }

  if (/^:.*:$/.test(icon)) {
    throw new Error(`Invalid Linear icon "${icon}". Unknown emoji shortcode; use one listed by list_visual_metadata_registry with includeEmojiShortcodes=true.`)
  }

  throw new Error(`Invalid Linear icon "${icon}". Use a decorative PascalCase registry name or an emoji colon shortcode such as ":foot:".`)
}

export function assertValidLinearColor(value: unknown): void {
  const color = optionalStringField('color', value)
  if (color === undefined) return
  if (!HEX_COLOR_RE.test(color)) {
    throw new Error(`Invalid Linear color "${color}". Use hex only: "#RRGGBB", "#RGB", or six hex digits. RGB/HSL/CSS names/CSS vars/GUI preset labels are not portable.`)
  }
}

export function assertValidVisualMetadataInput(input: Record<string, unknown>): void {
  if (Object.prototype.hasOwnProperty.call(input, 'icon')) {
    assertValidLinearIcon(input.icon)
  }
  if (Object.prototype.hasOwnProperty.call(input, 'color')) {
    assertValidLinearColor(input.color)
  }
}

export const visualMetadataTools: ToolDef[] = [
  {
    name: 'list_visual_metadata_registry',
    description: 'List accepted Linear visual metadata values for icon/color fields. Icons use decorative PascalCase names or emoji colon shortcodes; colors use hex.',
    sideEffect: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        includeEmojiShortcodes: {
          type: 'boolean',
          description: 'Include the full emoji colon-shortcode registry. Default false to keep output compact.',
        },
      },
    },
    async handler(args) {
      const includeEmojiShortcodes = args.includeEmojiShortcodes === true
      return JSON.stringify({
        testedAt: visualMetadata.testedAt,
        icon: {
          syntax: visualMetadata.icon.syntax,
          acceptedDecorative: visualMetadata.icon.acceptedDecorative,
          rejectedDecorative: visualMetadata.icon.rejectedDecorative,
          renderAliases: visualMetadata.icon.renderAliases,
        },
        emoji: includeEmojiShortcodes
          ? {
              syntax: visualMetadata.emoji.syntax,
              count: visualMetadata.emoji.colonNames.length,
              colonNames: visualMetadata.emoji.colonNames,
            }
          : {
              syntax: visualMetadata.emoji.syntax,
              count: visualMetadata.emoji.colonNames.length,
              examples: [':foot:', ':adhesive_bandage:', ':eagle:', ':flag-ch:'],
              note: 'Pass includeEmojiShortcodes=true for the full shortcode list.',
            },
        color: {
          syntax: visualMetadata.color.syntax,
          portableRegex: visualMetadata.color.portableRegex,
          acceptedExamples: visualMetadata.color.acceptedExamples,
          rejectedExamples: visualMetadata.color.rejectedExamples,
          notes: visualMetadata.color.notes,
        },
      }, null, 2)
    },
  },
]
