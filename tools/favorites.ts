import type { ToolDef } from './_types.js'
import { WORKSPACE_PROP, PAGINATION_PROPS } from './_types.js'
import { resolveWorkspace } from '../workspaces.js'
import { LinearClient } from '../client.js'

const FAVORITE_FIELDS = `
  id type title detail color icon folderName sortOrder archivedAt createdAt updatedAt
  owner { id name }
  parent { id title folderName sortOrder }
  children { nodes { id type title folderName sortOrder } }
  issue { id identifier title }
  project { id name }
  projectTab
  predefinedViewType
  predefinedViewTeam { id name key }
  cycle { id number name }
  customView { id name icon color }
  document { id title }
  initiative { id name }
  initiativeTab
  label { id name color }
  projectLabel { id name color }
  user { id name }
  team { id name key }
  url
`

const LIST_FAVORITES_QUERY = `
  query ListFavorites($first: Int, $after: String, $includeArchived: Boolean) {
    favorites(first: $first, after: $after, includeArchived: $includeArchived) {
      pageInfo { hasNextPage endCursor }
      nodes { ${FAVORITE_FIELDS} }
    }
  }
`

const CREATE_FAVORITE_MUTATION = `
  mutation CreateFavorite($input: FavoriteCreateInput!) {
    favoriteCreate(input: $input) {
      success
      favorite { ${FAVORITE_FIELDS} }
    }
  }
`

const UPDATE_FAVORITE_MUTATION = `
  mutation UpdateFavorite($id: String!, $input: FavoriteUpdateInput!) {
    favoriteUpdate(id: $id, input: $input) {
      success
      favorite { ${FAVORITE_FIELDS} }
    }
  }
`

const DELETE_FAVORITE_MUTATION = `
  mutation DeleteFavorite($id: String!) {
    favoriteDelete(id: $id) { success }
  }
`

const FAVORITE_TARGET_PROPS = {
  issueId: { type: 'string', description: 'Favorite an issue UUID' },
  projectId: { type: 'string', description: 'Favorite a project UUID' },
  projectTab: { type: 'string', description: 'Optional project tab enum for project favorites' },
  predefinedViewType: { type: 'string', description: 'Favorite a built-in Linear view type' },
  predefinedViewTeamId: { type: 'string', description: 'Team UUID for a team-scoped predefined view' },
  cycleId: { type: 'string', description: 'Favorite a cycle UUID' },
  customViewId: { type: 'string', description: 'Favorite a custom view UUID' },
  documentId: { type: 'string', description: 'Favorite a document UUID' },
  initiativeId: { type: 'string', description: 'Favorite an initiative UUID' },
  initiativeTab: { type: 'string', description: 'Optional initiative tab enum for initiative favorites' },
  labelId: { type: 'string', description: 'Favorite an issue label UUID' },
  projectLabelId: { type: 'string', description: 'Favorite a project label UUID' },
  userId: { type: 'string', description: 'Favorite a user UUID' },
  teamId: { type: 'string', description: 'Favorite a team UUID' },
} as const

export const favoriteTools: ToolDef[] = [
  {
    name: 'list_favorites',
    description: 'List sidebar favorites and favorite folders. Favorites are personal to the authenticated Linear user.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        includeArchived: { type: 'boolean', description: 'Include deleted/archived favorites (default: false)' },
        ...PAGINATION_PROPS,
      },
    },
    examples: [
      {
        title: 'First page',
        args: { workspace: 'personal', first: 50 },
      },
    ],
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(LIST_FAVORITES_QUERY, {
        first: (args.first as number) || 50,
        after: args.after as string | undefined,
        includeArchived: (args.includeArchived as boolean) || false,
      })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'create_favorite',
    description: 'Create a sidebar favorite or folder. Use folderName for a folder; otherwise provide exactly one target ID such as customViewId, projectId, issueId, labelId, or initiativeId. Use parentId to place it inside a folder and sortOrder for manual ordering.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Optional client-generated favorite UUID' },
        folderName: { type: 'string', description: 'Folder name; if set without a target this creates a favorite folder' },
        parentId: { type: 'string', description: 'Parent favorite folder UUID' },
        sortOrder: { type: 'number', description: 'Manual order within the sidebar/folder' },
        ...FAVORITE_TARGET_PROPS,
      },
    },
    examples: [
      {
        title: 'Folder',
        args: { workspace: 'personal', folderName: 'Linear MCP Sandbox', sortOrder: 1000 },
      },
      {
        title: 'Custom view in folder',
        args: { workspace: 'personal', customViewId: 'custom-view-uuid', parentId: 'favorite-folder-uuid', sortOrder: 1001 },
      },
    ],
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, ...input } = args
      const data = await client.query(CREATE_FAVORITE_MUTATION, { input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'update_favorite',
    description: 'Update a favorite folder name, parent folder, or sortOrder. Linear only exposes folderName, parentId, and sortOrder for favorite updates.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Favorite UUID' },
        folderName: { type: 'string', description: 'New folder name, for folder favorites' },
        parentId: { type: 'string', description: 'New parent favorite folder UUID; set null through raw JSON to move to root if Linear accepts it' },
        sortOrder: { type: 'number', description: 'Manual order within the sidebar/folder' },
      },
      required: ['id'],
    },
    examples: [
      {
        title: 'Reorder',
        args: { workspace: 'personal', id: 'favorite-uuid', sortOrder: 2000 },
      },
    ],
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const { workspace: _, id, ...input } = args
      const data = await client.query(UPDATE_FAVORITE_MUTATION, { id, input })
      return JSON.stringify(data, null, 2)
    },
  },
  {
    name: 'delete_favorite',
    description: 'Remove a sidebar favorite or favorite folder. This only removes the shortcut/folder, not the underlying issue, project, view, or label.',
    inputSchema: {
      type: 'object',
      properties: {
        ...WORKSPACE_PROP,
        id: { type: 'string', description: 'Favorite UUID' },
      },
      required: ['id'],
    },
    async handler(args) {
      const ws = resolveWorkspace(args.workspace as string | undefined)
      const client = new LinearClient(ws)
      const data = await client.query(DELETE_FAVORITE_MUTATION, { id: args.id })
      return JSON.stringify(data, null, 2)
    },
  },
]
