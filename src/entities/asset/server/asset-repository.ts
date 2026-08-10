import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  lt,
  ne,
  or,
} from 'drizzle-orm';
import { assetSelect, createLibraryConditions } from './asset-library-query';
import type { AssetRepository } from './asset-repository-contracts';
import { getDb } from '@/shared/db/client';
import { asset, assetVariant } from '@/shared/db/schema/asset';
import { document } from '@/shared/db/schema/document';
import { membership } from '@/shared/db/schema/workspace';

export type {
  AssetLibraryCursor,
  AssetLibraryFacets,
  AssetLibraryFilters,
  AssetMediaKind,
  AssetOrigin,
  AssetRecord,
  AssetRepository,
  AssetVariantInput,
  AssetVariantPurpose,
  AssetVariantRecord,
  LibraryAssetRecord,
  PendingAssetInput,
} from './asset-repository-contracts';

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
      const [record] = await getDb().select(assetSelect).from(asset)
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
          lt(asset.createdAt, before),
          or(
            inArray(asset.status, ['pending', 'failed']),
            and(eq(asset.status, 'ready'), eq(asset.libraryVisible, false)),
          ),
        ))
        .orderBy(asc(asset.createdAt))
        .limit(limit);
    },

    async findGeneratedByJobId(generationJobId) {
      const [record] = await getDb().select().from(asset)
        .where(and(
          eq(asset.generationJobId, generationJobId),
          eq(asset.origin, 'generated'),
          ne(asset.status, 'deleted'),
        ))
        .limit(1);
      return record;
    },

    async findVariant(assetId, purpose) {
      const [record] = await getDb().select().from(assetVariant)
        .where(and(
          eq(assetVariant.assetId, assetId),
          eq(assetVariant.purpose, purpose),
        ))
        .limit(1);
      return record;
    },

    async listLibrary(input) {
      const conditions = createLibraryConditions(input);
      return getDb().select({
        ...assetSelect,
        documentName: document.name,
        documentStatus: document.status,
        thumbnailVariantId: assetVariant.id,
      }).from(asset)
        .innerJoin(membership, and(
          eq(membership.workspaceId, asset.workspaceId),
          eq(membership.userId, input.userId),
        ))
        .leftJoin(document, eq(document.id, asset.documentId))
        .leftJoin(assetVariant, and(
          eq(assetVariant.assetId, asset.id),
          eq(assetVariant.purpose, 'thumbnail'),
        ))
        .where(and(...conditions))
        .orderBy(desc(asset.createdAt), desc(asset.id))
        .limit(input.limit);
    },

    async listLibraryFacets(input) {
      const db = getDb();
      const baseConditions = and(
        eq(asset.workspaceId, input.workspaceId),
        eq(asset.libraryVisible, true),
        eq(asset.status, 'ready'),
        eq(membership.userId, input.userId),
      );
      const [origins, mediaKinds, providers, models, documents] = await Promise.all([
        db.select({
          value: asset.origin,
          count: count(),
        }).from(asset)
          .innerJoin(membership, eq(membership.workspaceId, asset.workspaceId))
          .where(baseConditions)
          .groupBy(asset.origin)
          .orderBy(asc(asset.origin)),
        db.select({
          value: asset.mediaKind,
          count: count(),
        }).from(asset)
          .innerJoin(membership, eq(membership.workspaceId, asset.workspaceId))
          .where(baseConditions)
          .groupBy(asset.mediaKind)
          .orderBy(asc(asset.mediaKind)),
        db.select({
          value: asset.provider,
          count: count(),
        }).from(asset)
          .innerJoin(membership, eq(membership.workspaceId, asset.workspaceId))
          .where(and(baseConditions, isNotNullText(asset.provider)))
          .groupBy(asset.provider)
          .orderBy(asc(asset.provider)),
        db.select({
          provider: asset.provider,
          modelId: asset.modelId,
          count: count(),
        }).from(asset)
          .innerJoin(membership, eq(membership.workspaceId, asset.workspaceId))
          .where(and(baseConditions, isNotNullText(asset.modelId)))
          .groupBy(asset.provider, asset.modelId)
          .orderBy(asc(asset.provider), asc(asset.modelId)),
        db.select({
          id: document.id,
          name: document.name,
          status: document.status,
          count: count(),
        }).from(asset)
          .innerJoin(membership, eq(membership.workspaceId, asset.workspaceId))
          .innerJoin(document, eq(document.id, asset.documentId))
          .where(baseConditions)
          .groupBy(document.id, document.name, document.status)
          .orderBy(asc(document.name), asc(document.id)),
      ]);
      return {
        origins,
        mediaKinds,
        providers: providers.flatMap((row) => row.value ? [{ ...row, value: row.value }] : []),
        models: models.flatMap((row) => row.modelId
          ? [{ ...row, modelId: row.modelId }]
          : []),
        documents,
      };
    },

    async listByDocument(documentId) {
      return getDb().select().from(asset)
        .where(and(
          eq(asset.documentId, documentId),
          inArray(asset.status, ['pending', 'ready', 'failed']),
        ))
        .orderBy(asc(asset.createdAt));
    },

    async listVariants(assetId) {
      return getDb().select().from(assetVariant)
        .where(eq(assetVariant.assetId, assetId))
        .orderBy(asc(assetVariant.createdAt));
    },

    async markLibraryVisible(assetId) {
      const [updated] = await getDb().update(asset).set({
        libraryVisible: true,
        updatedAt: new Date(),
      }).where(and(
        eq(asset.id, assetId),
        eq(asset.status, 'ready'),
        eq(asset.libraryVisible, false),
      )).returning();
      if (updated) return updated;
      const [existing] = await getDb().select().from(asset)
        .where(and(
          eq(asset.id, assetId),
          eq(asset.status, 'ready'),
          eq(asset.libraryVisible, true),
        ))
        .limit(1);
      return existing;
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

    async resetPending(assetId) {
      const [updated] = await getDb().update(asset).set({
        status: 'pending',
        errorCode: null,
        libraryVisible: false,
        deletedAt: null,
        updatedAt: new Date(),
      }).where(and(
        eq(asset.id, assetId),
        inArray(asset.status, ['pending', 'failed']),
      )).returning();
      if (!updated) throw new Error('Asset could not be reset for upload retry.');
      return updated;
    },

    async upsertVariant(input) {
      const [record] = await getDb().insert(assetVariant).values(input)
        .onConflictDoUpdate({
          target: [assetVariant.assetId, assetVariant.purpose],
          set: {
            bucket: input.bucket,
            storageKey: input.storageKey,
            contentType: input.contentType,
            byteSize: input.byteSize,
            width: input.width,
            height: input.height,
            checksumSha256: input.checksumSha256,
            updatedAt: new Date(),
          },
        })
        .returning();
      if (!record) throw new Error('Asset variant could not be stored.');
      return record;
    },
  };
}

function isNotNullText(column: typeof asset.provider | typeof asset.modelId) {
  return and(isNotNull(column), ne(column, ''));
}
