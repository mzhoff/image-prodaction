import {
  FAVORITE_NODE_PAYLOAD_VERSION,
  canonicalizeFavoriteSnapshot,
  createFavoriteNodeSnapshot,
  createNodeFromFavoriteSnapshot,
  favoriteNodeSnapshotsEqual,
  filterFavoriteNodeAssetIds,
  getFavoriteNodeAssetIds,
  type FavoriteNodeSnapshot,
} from './favorite-node-preset';

export const NODE_TEMPLATE_PAYLOAD_VERSION = FAVORITE_NODE_PAYLOAD_VERSION;

export type NodeTemplateSnapshot = FavoriteNodeSnapshot;

export interface NodeTemplatePreset {
  createdAt: string;
  fingerprint: string;
  id: string;
  snapshot: NodeTemplateSnapshot;
  updatedAt: string;
  workspaceId: string;
}

export const createNodeTemplateSnapshot = createFavoriteNodeSnapshot;
export const createNodeFromTemplateSnapshot = createNodeFromFavoriteSnapshot;
export const nodeTemplateSnapshotsEqual = favoriteNodeSnapshotsEqual;
export const canonicalizeNodeTemplateSnapshot = canonicalizeFavoriteSnapshot;
export const getNodeTemplateAssetIds = getFavoriteNodeAssetIds;
export const filterNodeTemplateAssetIds = filterFavoriteNodeAssetIds;
