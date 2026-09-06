import { and, count, desc, eq } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { nodeTemplatePreset } from '@/shared/db/schema/node-template';

export interface NodeTemplateRecord {
  createdAt: Date;
  fingerprint: string;
  id: string;
  nodeType: string;
  payload: unknown;
  payloadBytes: number;
  payloadVersion: number;
  updatedAt: Date;
  userId: string;
  workspaceId: string;
}

export interface SaveNodeTemplateRecord {
  fingerprint: string;
  id: string;
  nodeType: string;
  payload: unknown;
  payloadBytes: number;
  payloadVersion: number;
  userId: string;
  workspaceId: string;
}

export interface NodeTemplateRepository {
  count(userId: string, workspaceId: string): Promise<number>;
  delete(id: string, userId: string, workspaceId: string): Promise<boolean>;
  findByFingerprint(
    userId: string,
    workspaceId: string,
    fingerprint: string,
  ): Promise<NodeTemplateRecord | null>;
  list(userId: string, workspaceId: string): Promise<NodeTemplateRecord[]>;
  upsert(input: SaveNodeTemplateRecord): Promise<NodeTemplateRecord>;
}

export function createDbNodeTemplateRepository(): NodeTemplateRepository {
  const db = getDb();
  return {
    async count(userId, workspaceId) {
      const [row] = await db.select({ total: count() }).from(nodeTemplatePreset).where(and(
        eq(nodeTemplatePreset.userId, userId),
        eq(nodeTemplatePreset.workspaceId, workspaceId),
      ));
      return Number(row?.total ?? 0);
    },
    async delete(id, userId, workspaceId) {
      const rows = await db.delete(nodeTemplatePreset).where(and(
        eq(nodeTemplatePreset.id, id),
        eq(nodeTemplatePreset.userId, userId),
        eq(nodeTemplatePreset.workspaceId, workspaceId),
      )).returning({ id: nodeTemplatePreset.id });
      return rows.length > 0;
    },
    async findByFingerprint(userId, workspaceId, fingerprint) {
      const [row] = await db.select().from(nodeTemplatePreset).where(and(
        eq(nodeTemplatePreset.userId, userId),
        eq(nodeTemplatePreset.workspaceId, workspaceId),
        eq(nodeTemplatePreset.fingerprint, fingerprint),
      )).limit(1);
      return row ?? null;
    },
    list(userId, workspaceId) {
      return db.select().from(nodeTemplatePreset).where(and(
        eq(nodeTemplatePreset.userId, userId),
        eq(nodeTemplatePreset.workspaceId, workspaceId),
      )).orderBy(desc(nodeTemplatePreset.updatedAt));
    },
    async upsert(input) {
      const [row] = await db.insert(nodeTemplatePreset).values(input).onConflictDoUpdate({
        target: [
          nodeTemplatePreset.userId,
          nodeTemplatePreset.workspaceId,
          nodeTemplatePreset.fingerprint,
        ],
        set: {
          nodeType: input.nodeType,
          payload: input.payload,
          payloadBytes: input.payloadBytes,
          payloadVersion: input.payloadVersion,
          updatedAt: new Date(),
        },
      }).returning();
      if (!row) throw new Error('Node template preset could not be saved.');
      return row;
    },
  };
}
