import { createHash } from 'node:crypto';
import { getAssetMetadata } from '@/entities/asset/server/asset-service';
import { requireWorkspaceMembership } from '@/entities/workspace/server/workspace-service';
import {
  canonicalizeFavoriteSnapshot,
  createFavoriteNodeSnapshot,
  FAVORITE_NODE_PAYLOAD_VERSION,
  filterFavoriteNodeAssetIds,
  getFavoriteNodeAssetIds,
  type FavoriteNodePreset,
  type FavoriteNodeSnapshot,
} from '@/entities/production-graph/model/favorite-node-preset';
import { PRODUCTION_NODE_TYPES } from '@/entities/production-graph/model/node-registry';
import type { ProductionNodeData, ProductionNodeType } from '@/entities/production-graph/model/types';
import { createUuidV7 } from '@/shared/lib/id';
import {
  createDbFavoriteNodeRepository,
  type FavoriteNodeRecord,
  type FavoriteNodeRepository,
} from './favorite-node-repository';

const MAX_FAVORITE_PAYLOAD_BYTES = 96 * 1024;
const MAX_FAVORITES_PER_WORKSPACE = 200;
const MAX_ASSET_REFERENCES = 50;

interface FavoriteNodeServiceDependencies {
  createId(): string;
  getAsset(userId: string, assetId: string): Promise<{ status: string; workspaceId: string }>;
  repository: FavoriteNodeRepository;
  requireMembership(userId: string, workspaceId: string): Promise<unknown>;
}

export interface SaveFavoriteNodeInput {
  data: Record<string, unknown>;
  nodeType: ProductionNodeType;
  userId: string;
  workspaceId: string;
}

export class FavoriteNodeValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'FavoriteNodeValidationError'; }
}

export class FavoriteNodeNotFoundError extends Error {
  constructor() { super('Favorite node preset not found.'); this.name = 'FavoriteNodeNotFoundError'; }
}

export class FavoriteNodeLimitError extends Error {
  constructor() { super('Favorite node limit reached for this workspace.'); this.name = 'FavoriteNodeLimitError'; }
}

export async function listFavoriteNodes(
  input: { userId: string; workspaceId: string },
  dependencies: FavoriteNodeServiceDependencies = createDefaultDependencies(),
) {
  await dependencies.requireMembership(input.userId, input.workspaceId);
  const rows = await dependencies.repository.list(input.userId, input.workspaceId);
  return rows.flatMap((row) => {
    try { return [toFavoriteNodePreset(row)]; } catch { return []; }
  });
}

export async function saveFavoriteNode(
  input: SaveFavoriteNodeInput,
  dependencies: FavoriteNodeServiceDependencies = createDefaultDependencies(),
) {
  await dependencies.requireMembership(input.userId, input.workspaceId);
  if (!PRODUCTION_NODE_TYPES.includes(input.nodeType)) {
    throw new FavoriteNodeValidationError('Unsupported node type.');
  }

  const initialSnapshot = createFavoriteNodeSnapshot({
    type: input.nodeType,
    data: input.data as unknown as ProductionNodeData,
  });
  const assetIds = getFavoriteNodeAssetIds(initialSnapshot);
  if (assetIds.length > MAX_ASSET_REFERENCES) {
    throw new FavoriteNodeValidationError('The favorite contains too many asset references.');
  }
  const allowedAssetIds = new Set<string>();
  await Promise.all(assetIds.map(async (assetId) => {
    const asset = await dependencies.getAsset(input.userId, assetId).catch(() => null);
    if (asset?.workspaceId === input.workspaceId && asset.status === 'ready') {
      allowedAssetIds.add(assetId);
    }
  }));
  const snapshot = filterFavoriteNodeAssetIds(initialSnapshot, allowedAssetIds);
  const serialized = canonicalizeFavoriteSnapshot(snapshot);
  const payloadBytes = Buffer.byteLength(serialized, 'utf8');
  if (payloadBytes <= 0 || payloadBytes > MAX_FAVORITE_PAYLOAD_BYTES) {
    throw new FavoriteNodeValidationError('The favorite node preset is too large.');
  }
  const fingerprint = createHash('sha256').update(serialized).digest('hex');
  const existing = await dependencies.repository.findByFingerprint(
    input.userId,
    input.workspaceId,
    fingerprint,
  );
  if (!existing && await dependencies.repository.count(input.userId, input.workspaceId)
    >= MAX_FAVORITES_PER_WORKSPACE) {
    throw new FavoriteNodeLimitError();
  }

  const saved = await dependencies.repository.upsert({
    fingerprint,
    id: existing?.id ?? dependencies.createId(),
    nodeType: snapshot.nodeType,
    payload: snapshot,
    payloadBytes,
    payloadVersion: FAVORITE_NODE_PAYLOAD_VERSION,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  return {
    favorite: toFavoriteNodePreset(saved),
    strippedAssetReferenceCount: assetIds.length - allowedAssetIds.size,
  };
}

export async function deleteFavoriteNode(
  input: { favoriteId: string; userId: string; workspaceId: string },
  dependencies: FavoriteNodeServiceDependencies = createDefaultDependencies(),
) {
  await dependencies.requireMembership(input.userId, input.workspaceId);
  const deleted = await dependencies.repository.delete(
    input.favoriteId,
    input.userId,
    input.workspaceId,
  );
  if (!deleted) throw new FavoriteNodeNotFoundError();
}

function createDefaultDependencies(): FavoriteNodeServiceDependencies {
  return {
    createId: createUuidV7,
    getAsset: getAssetMetadata,
    repository: createDbFavoriteNodeRepository(),
    requireMembership: requireWorkspaceMembership,
  };
}

function toFavoriteNodePreset(record: FavoriteNodeRecord): FavoriteNodePreset {
  if (record.payloadVersion !== FAVORITE_NODE_PAYLOAD_VERSION
    || !PRODUCTION_NODE_TYPES.includes(record.nodeType as ProductionNodeType)
    || !isFavoriteSnapshot(record.payload, record.nodeType as ProductionNodeType)) {
    throw new FavoriteNodeValidationError('Favorite node payload is not supported.');
  }
  return {
    createdAt: record.createdAt.toISOString(),
    fingerprint: record.fingerprint,
    id: record.id,
    snapshot: record.payload,
    updatedAt: record.updatedAt.toISOString(),
    workspaceId: record.workspaceId,
  };
}

function isFavoriteSnapshot(value: unknown, nodeType: ProductionNodeType): value is FavoriteNodeSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const snapshot = value as Partial<FavoriteNodeSnapshot>;
  return snapshot.version === FAVORITE_NODE_PAYLOAD_VERSION
    && snapshot.nodeType === nodeType
    && Boolean(snapshot.data) && typeof snapshot.data === 'object' && !Array.isArray(snapshot.data);
}
