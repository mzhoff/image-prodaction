import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { document, documentPreference } from '@/shared/db/schema/document';
import { membership } from '@/shared/db/schema/workspace';
import { createUuidV7 } from '@/shared/lib/id';
import type { ProjectExport } from '@/entities/production-graph/model/project-schema';
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

  return rows.map(toDocumentDto);
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

export async function permanentlyDeleteDocument(userId: string, documentId: string) {
  const current = await getDocument(userId, documentId);
  if (current.status !== 'trash') throw new DocumentConflictError(current.revision);
  await getDb().delete(document).where(eq(document.id, documentId));
}

async function selectAccessibleDocument(userId: string, documentId: string) {
  return getDb().select({
    id: document.id,
    workspaceId: document.workspaceId,
    name: document.name,
    status: document.status,
    snapshot: document.snapshot,
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
  id: string;
  name: string;
  revision: number;
  schemaVersion: number;
  snapshot: ProjectExport | null;
  status: 'active' | 'trash';
  updatedAt: Date;
  workspaceId: string;
}) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    thumbnailUrl: '/workspace-assets/project-blog-pipeline.png',
    favorite: row.favorite ?? false,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    revision: row.revision,
    schemaVersion: row.schemaVersion,
    snapshot: row.snapshot ?? undefined,
  };
}

function normalizeDocumentName(name?: string) {
  const value = name?.trim().replace(/\s+/g, ' ').slice(0, 120);
  return value || 'Untitled Pipeline';
}
