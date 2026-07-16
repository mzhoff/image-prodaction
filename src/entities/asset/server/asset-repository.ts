import { and, asc, eq, inArray, lt } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { asset } from '@/shared/db/schema/asset';
import { membership } from '@/shared/db/schema/workspace';

export type AssetRecord = typeof asset.$inferSelect;

export interface PendingAssetInput {
  bucket: string;
  byteSize: number;
  checksumSha256: string;
  contentType: string;
  createdByUserId: string;
  documentId: string | null;
  height: number | null;
  id: string;
  originalName: string;
  storageKey: string;
  width: number | null;
  workspaceId: string;
}

export interface AssetRepository {
  createPending(input: PendingAssetInput): Promise<AssetRecord>;
  findAccessible(assetId: string, userId: string): Promise<AssetRecord | undefined>;
  findCleanupCandidates(before: Date, limit: number): Promise<AssetRecord[]>;
  markDeleted(assetId: string, deletedAt: Date): Promise<void>;
  markFailed(assetId: string, errorCode: string): Promise<void>;
  markReady(assetId: string): Promise<AssetRecord>;
}

export function createDbAssetRepository(): AssetRepository {
  return {
    async createPending(input) {
      const [created] = await getDb().insert(asset).values({
        ...input,
        status: 'pending',
      }).returning();
      if (!created) throw new Error('Pending asset could not be created.');
      return created;
    },

    async findAccessible(assetId, userId) {
      const [record] = await getDb().select({
        id: asset.id,
        workspaceId: asset.workspaceId,
        documentId: asset.documentId,
        createdByUserId: asset.createdByUserId,
        bucket: asset.bucket,
        storageKey: asset.storageKey,
        originalName: asset.originalName,
        contentType: asset.contentType,
        byteSize: asset.byteSize,
        width: asset.width,
        height: asset.height,
        checksumSha256: asset.checksumSha256,
        status: asset.status,
        errorCode: asset.errorCode,
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt,
        deletedAt: asset.deletedAt,
      }).from(asset)
        .innerJoin(membership, and(
          eq(membership.workspaceId, asset.workspaceId),
          eq(membership.userId, userId),
        ))
        .where(eq(asset.id, assetId))
        .limit(1);
      return record;
    },

    async findCleanupCandidates(before, limit) {
      return getDb().select().from(asset)
        .where(and(
          inArray(asset.status, ['pending', 'failed']),
          lt(asset.createdAt, before),
        ))
        .orderBy(asc(asset.createdAt))
        .limit(limit);
    },

    async markDeleted(assetId, deletedAt) {
      await getDb().update(asset).set({
        status: 'deleted',
        deletedAt,
        updatedAt: deletedAt,
      }).where(eq(asset.id, assetId));
    },

    async markFailed(assetId, errorCode) {
      await getDb().update(asset).set({
        status: 'failed',
        errorCode,
        updatedAt: new Date(),
      }).where(and(eq(asset.id, assetId), eq(asset.status, 'pending')));
    },

    async markReady(assetId) {
      const [updated] = await getDb().update(asset).set({
        status: 'ready',
        errorCode: null,
        updatedAt: new Date(),
      }).where(and(eq(asset.id, assetId), eq(asset.status, 'pending'))).returning();
      if (!updated) throw new Error('Pending asset could not be marked ready.');
      return updated;
    },
  };
}
