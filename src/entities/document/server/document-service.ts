import { and, desc, eq, isNull, ne, notExists, sql } from 'drizzle-orm';
import {
  DEFAULT_DOCUMENT_NAME,
  documentSnapshotHasContent,
  isDisposableUntouchedDocument,
} from '@/entities/document/model/document-lifecycle';
import { getDb } from '@/shared/db/client';
import { document, documentPreference } from '@/shared/db/schema/document';
import { membership } from '@/shared/db/schema/workspace';
import { createUuidV7 } from '@/shared/lib/id';
import { requireWorkspaceMembership } from '@/entities/workspace/server/workspace-service';
import { validateDocumentSnapshot } from './document-validation';

export class DocumentNotFoundError extends Error {
  constructor() {
    super('Document not found.');
    this.name = 'DocumentNotFoundError';
  }
}

export class DocumentConflictError extends Error {
  readonly currentRevision?: number;

  constructor(currentRevision?: number) {
    super('Document revision conflict.');
    this.name = 'DocumentConflictError';
    this.currentRevision = currentRevision;
  }
}

export async function listDocuments(userId: string) {
  const rows = await getDb().select({
    id: document.id,
    workspaceId: document.workspaceId,
    name: document.name,
    status: document.status,
    snapshot: document.snapshot,
    thumbnailAssetId: document.thumbnailAssetId,
    thumbnailMode: document.thumbnailMode,
    thumbnailUpdatedAt: document.thumbnailUpdatedAt,
    hasEverHadContent: document.hasEverHadContent,
    schemaVersion: document.schemaVersion,
    revision: document.revision,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    favorite: documentPreference.favorite,
  }).from(document)
    .innerJoin(membership, and(
      eq(membership.workspaceId, document.workspaceId),
      eq(membership.userId, userId),
    ))
    .leftJoin(documentPreference, and(
      eq(documentPreference.documentId, document.id),
      eq(documentPreference.userId, userId),
    ))
    .orderBy(desc(document.updatedAt));

  return rows
    .map(toDocumentDto)
    .filter((project) => project.status === 'trash' || !isDisposableUntouchedDocument(project));
}

export async function createDocument(input: { name?: string; userId: string; workspaceId: string }) {
  await requireWorkspaceMembership(input.userId, input.workspaceId);
  const [created] = await getDb().insert(document).values({
    id: createUuidV7(),
    workspaceId: input.workspaceId,
    createdByUserId: input.userId,
    name: normalizeDocumentName(input.name),
  }).returning();
  return toDocumentDto({ ...created, favorite: false });
}

export async function getDocument(userId: string, documentId: string) {
  const [row] = await selectAccessibleDocument(userId, documentId);
  if (!row) throw new DocumentNotFoundError();
  return toDocumentDto(row);
}

export async function updateDocumentMetadata(input: {
  favorite?: boolean;
  name?: string;
  status?: 'active' | 'trash';
  userId: string;
  documentId: string;
}) {
  const current = await getDocument(input.userId, input.documentId);
  const patch: Partial<typeof document.$inferInsert> = {};
  if (input.name !== undefined) patch.name = normalizeDocumentName(input.name);
  if (input.status !== undefined) {
    patch.status = input.status;
    patch.trashedAt = input.status === 'trash' ? new Date() : null;
  }

  if (Object.keys(patch).length) {
    await getDb().update(document).set(patch).where(eq(document.id, input.documentId));
  }
  if (input.favorite !== undefined) {
    await getDb().insert(documentPreference).values({
      documentId: input.documentId,
      userId: input.userId,
      favorite: input.favorite,
    }).onConflictDoUpdate({
      target: [documentPreference.documentId, documentPreference.userId],
      set: { favorite: input.favorite, updatedAt: new Date() },
    });
  }

  return getDocument(input.userId, current.id);
}

export async function saveDocumentSnapshot(input: {
  documentId: string;
  expectedRevision: number;
  snapshot: unknown;
  userId: string;
}) {
  const current = await getDocument(input.userId, input.documentId);
  const snapshot = validateDocumentSnapshot(input.snapshot);
  const [updated] = await getDb().update(document).set({
    snapshot,
    hasEverHadContent: current.hasEverHadContent || documentSnapshotHasContent(snapshot),
    schemaVersion: snapshot.schemaVersion,
    revision: sql`${document.revision} + 1`,
    updatedAt: new Date(),
  }).where(and(
    eq(document.id, input.documentId),
    eq(document.revision, input.expectedRevision),
  )).returning();

  if (!updated) throw new DocumentConflictError(current.revision);
  return toDocumentDto({ ...updated, favorite: current.favorite });
}

export async function setDocumentThumbnail(input: {
  assetId: string;
  documentId: string;
  mode: 'auto' | 'manual';
  userId: string;
}) {
  const [current] = await selectAccessibleDocument(input.userId, input.documentId);
  if (!current) throw new DocumentNotFoundError();

  if (input.mode === 'auto' && current.thumbnailMode === 'manual') {
    return {
      applied: false,
      previousAssetId: current.thumbnailAssetId,
      project: toDocumentDto(current),
    };
  }

  const conditions = [eq(document.id, input.documentId)];
  if (input.mode === 'auto') conditions.push(ne(document.thumbnailMode, 'manual'));
  const [updated] = await getDb().update(document).set({
    thumbnailAssetId: input.assetId,
    thumbnailMode: input.mode,
    thumbnailUpdatedAt: new Date(),
  }).where(and(...conditions)).returning();

  if (!updated) {
    const [latest] = await selectAccessibleDocument(input.userId, input.documentId);
    if (!latest) throw new DocumentNotFoundError();
    return {
      applied: false,
      previousAssetId: latest.thumbnailAssetId,
      project: toDocumentDto(latest),
    };
  }

  return {
    applied: true,
    previousAssetId: current.thumbnailAssetId,
    project: toDocumentDto({ ...updated, favorite: current.favorite }),
  };
}

export async function permanentlyDeleteDocument(userId: string, documentId: string) {
  const current = await getDocument(userId, documentId);
  if (current.status !== 'trash') throw new DocumentConflictError(current.revision);
  await getDb().delete(document).where(eq(document.id, documentId));
}

export async function discardUntouchedDocument(userId: string, documentId: string) {
  const current = await getDocument(userId, documentId);
  if (!isDisposableUntouchedDocument(current)) return false;

  const database = getDb();
  const favoritePreference = database.select({ documentId: documentPreference.documentId })
    .from(documentPreference)
    .where(and(
      eq(documentPreference.documentId, documentId),
      eq(documentPreference.userId, userId),
      eq(documentPreference.favorite, true),
    ));
  const discardedAt = new Date();
  const [discarded] = await database.update(document).set({
    status: 'trash',
    trashedAt: discardedAt,
    revision: sql`${document.revision} + 1`,
    updatedAt: discardedAt,
  }).where(and(
    eq(document.id, documentId),
    eq(document.createdByUserId, userId),
    eq(document.status, 'active'),
    eq(document.name, DEFAULT_DOCUMENT_NAME),
    eq(document.hasEverHadContent, false),
    eq(document.revision, current.revision),
    isNull(document.thumbnailAssetId),
    notExists(favoritePreference),
  )).returning({ id: document.id });

  return Boolean(discarded);
}

async function selectAccessibleDocument(userId: string, documentId: string) {
  return getDb().select({
    id: document.id,
    workspaceId: document.workspaceId,
    name: document.name,
    status: document.status,
    snapshot: document.snapshot,
    thumbnailAssetId: document.thumbnailAssetId,
    thumbnailMode: document.thumbnailMode,
    thumbnailUpdatedAt: document.thumbnailUpdatedAt,
    hasEverHadContent: document.hasEverHadContent,
    schemaVersion: document.schemaVersion,
    revision: document.revision,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    favorite: documentPreference.favorite,
  }).from(document)
    .innerJoin(membership, and(
      eq(membership.workspaceId, document.workspaceId),
      eq(membership.userId, userId),
    ))
    .leftJoin(documentPreference, and(
      eq(documentPreference.documentId, document.id),
      eq(documentPreference.userId, userId),
    ))
    .where(eq(document.id, documentId))
    .limit(1);
}

function toDocumentDto(row: {
  createdAt: Date;
  favorite: boolean | null;
  hasEverHadContent: boolean;
  id: string;
  name: string;
  revision: number;
  schemaVersion: number;
  snapshot: unknown | null;
  status: 'active' | 'trash';
  thumbnailAssetId: string | null;
  thumbnailMode: 'auto' | 'manual';
  thumbnailUpdatedAt: Date | null;
  updatedAt: Date;
  workspaceId: string;
}) {
  const snapshot = row.snapshot === null ? undefined : validateDocumentSnapshot(row.snapshot);
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    thumbnailUrl: row.thumbnailAssetId
      ? `/api/assets/${row.thumbnailAssetId}/content?variant=thumbnail`
      : '',
    thumbnailMode: row.thumbnailMode,
    thumbnailAvailable: Boolean(row.thumbnailAssetId),
    hasEverHadContent: row.hasEverHadContent,
    thumbnailUpdatedAt: row.thumbnailUpdatedAt?.toISOString(),
    favorite: row.favorite ?? false,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    revision: row.revision,
    schemaVersion: row.schemaVersion,
    snapshot,
  };
}

function normalizeDocumentName(name?: string) {
  const value = name?.trim().replace(/\s+/g, ' ').slice(0, 120);
  return value || DEFAULT_DOCUMENT_NAME;
}
