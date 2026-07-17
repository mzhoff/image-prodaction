import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  lt,
  ne,
  or,
  type SQL,
} from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { asset, assetVariant } from '@/shared/db/schema/asset';
import { document } from '@/shared/db/schema/document';
import { membership } from '@/shared/db/schema/workspace';

export type AssetRecord = typeof asset.$inferSelect;
export type AssetMediaKind = AssetRecord['mediaKind'];
export type AssetOrigin = AssetRecord['origin'];
export type AssetVariantRecord = typeof assetVariant.$inferSelect;
export type AssetVariantPurpose = AssetVariantRecord['purpose'];

export interface AssetLibraryCursor {
  createdAt: Date;
  id: string;
}

export interface AssetLibraryFilters {
  cursor?: AssetLibraryCursor;
  documentIds?: string[];
  limit: number;
  mediaKinds?: AssetMediaKind[];
  modelIds?: string[];
  origins?: AssetOrigin[];
  providers?: string[];
  search?: string;
  userId: string;
  workspaceId: string;
}

export type LibraryAssetRecord = AssetRecord & {
  documentName: string | null;
  documentStatus: 'active' | 'trash' | null;
  thumbnailVariantId: string | null;
};

export interface AssetLibraryFacets {
  documents: Array<{
    count: number;
    id: string;
    name: string;
    status: 'active' | 'trash';
  }>;
  mediaKinds: Array<{ count: number; value: AssetMediaKind }>;
  models: Array<{ count: number; modelId: string; provider: string | null }>;
  origins: Array<{ count: number; value: AssetOrigin }>;
  providers: Array<{ count: number; value: string }>;
}

export interface PendingAssetInput {
  bucket: string;
  byteSize: number;
  checksumSha256: string;
  contentType: string;
  createdByUserId: string;
  documentId: string | null;
  height: number | null;
  id: string;
  libraryVisible: boolean;
  mediaKind: AssetMediaKind;
  metadata: Record<string, unknown> | null;
  modelId: string | null;
  operation: string | null;
  origin: AssetOrigin;
  originalName: string;
  provider: string | null;
  storageKey: string;
  width: number | null;
  workspaceId: string;
  generationJobId: string | null;
}

export interface AssetVariantInput {
  assetId: string;
  bucket: string;
  byteSize: number;
  checksumSha256: string;
  contentType: string;
  height: number | null;
  id: string;
  purpose: AssetVariantPurpose;
  storageKey: string;
  width: number | null;
}

export interface AssetRepository {
  createPending(input: PendingAssetInput): Promise<AssetRecord>;
  findAccessible(assetId: string, userId: string): Promise<AssetRecord | undefined>;
  findCleanupCandidates(before: Date, limit: number): Promise<AssetRecord[]>;
  findGeneratedByJobId(generationJobId: string): Promise<AssetRecord | undefined>;
  findVariant(assetId: string, purpose: AssetVariantPurpose): Promise<AssetVariantRecord | undefined>;
  listLibrary(input: AssetLibraryFilters): Promise<LibraryAssetRecord[]>;
  listLibraryFacets(input: { userId: string; workspaceId: string }): Promise<AssetLibraryFacets>;
  listByDocument(documentId: string): Promise<AssetRecord[]>;
  listVariants(assetId: string): Promise<AssetVariantRecord[]>;
  markLibraryVisible(assetId: string): Promise<AssetRecord | undefined>;
  markDeleted(assetId: string, deletedAt: Date): Promise<void>;
  markFailed(assetId: string, errorCode: string): Promise<void>;
  markReady(assetId: string): Promise<AssetRecord>;
  resetPending(assetId: string): Promise<AssetRecord>;
  upsertVariant(input: AssetVariantInput): Promise<AssetVariantRecord>;
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

const assetSelect = {
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
  mediaKind: asset.mediaKind,
  origin: asset.origin,
  libraryVisible: asset.libraryVisible,
  provider: asset.provider,
  modelId: asset.modelId,
  operation: asset.operation,
  metadata: asset.metadata,
  generationJobId: asset.generationJobId,
  status: asset.status,
  errorCode: asset.errorCode,
  createdAt: asset.createdAt,
  updatedAt: asset.updatedAt,
  deletedAt: asset.deletedAt,
};

function createLibraryConditions(input: AssetLibraryFilters): SQL[] {
  const conditions: SQL[] = [
    eq(asset.workspaceId, input.workspaceId),
    eq(asset.libraryVisible, true),
    eq(asset.status, 'ready'),
  ];
  if (input.origins?.length) conditions.push(inArray(asset.origin, input.origins));
  if (input.mediaKinds?.length) conditions.push(inArray(asset.mediaKind, input.mediaKinds));
  if (input.providers?.length) conditions.push(inArray(asset.provider, input.providers));
  if (input.modelIds?.length) conditions.push(inArray(asset.modelId, input.modelIds));
  if (input.documentIds?.length) conditions.push(inArray(asset.documentId, input.documentIds));
  if (input.search) {
    const pattern = `%${input.search}%`;
    const searchCondition = or(
      ilike(asset.originalName, pattern),
      ilike(asset.modelId, pattern),
      ilike(asset.provider, pattern),
      ilike(asset.operation, pattern),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  if (input.cursor) {
    const cursorCondition = or(
      lt(asset.createdAt, input.cursor.createdAt),
      and(
        eq(asset.createdAt, input.cursor.createdAt),
        lt(asset.id, input.cursor.id),
      ),
    );
    if (cursorCondition) conditions.push(cursorCondition);
  }
  return conditions;
}

function isNotNullText(column: typeof asset.provider | typeof asset.modelId) {
  return and(isNotNull(column), ne(column, ''));
}
