import { and, count, desc, eq } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { favoriteNodePreset } from '@/shared/db/schema/favorite-node';

export interface FavoriteNodeRecord {
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

export interface SaveFavoriteNodeRecord {
  fingerprint: string;
  id: string;
  nodeType: string;
  payload: unknown;
  payloadBytes: number;
  payloadVersion: number;
  userId: string;
  workspaceId: string;
}

export interface FavoriteNodeRepository {
  count(userId: string, workspaceId: string): Promise<number>;
  delete(id: string, userId: string, workspaceId: string): Promise<boolean>;
  findByFingerprint(userId: string, workspaceId: string, fingerprint: string): Promise<FavoriteNodeRecord | null>;
  list(userId: string, workspaceId: string): Promise<FavoriteNodeRecord[]>;
  upsert(input: SaveFavoriteNodeRecord): Promise<FavoriteNodeRecord>;
}

export function createDbFavoriteNodeRepository(): FavoriteNodeRepository {
  const db = getDb();
  return {
    async count(userId, workspaceId) {
      const [row] = await db.select({ total: count() }).from(favoriteNodePreset).where(and(
        eq(favoriteNodePreset.userId, userId),
        eq(favoriteNodePreset.workspaceId, workspaceId),
      ));
      return Number(row?.total ?? 0);
    },
    async delete(id, userId, workspaceId) {
      const rows = await db.delete(favoriteNodePreset).where(and(
        eq(favoriteNodePreset.id, id),
        eq(favoriteNodePreset.userId, userId),
        eq(favoriteNodePreset.workspaceId, workspaceId),
      )).returning({ id: favoriteNodePreset.id });
      return rows.length > 0;
    },
    async findByFingerprint(userId, workspaceId, fingerprint) {
      const [row] = await db.select().from(favoriteNodePreset).where(and(
        eq(favoriteNodePreset.userId, userId),
        eq(favoriteNodePreset.workspaceId, workspaceId),
        eq(favoriteNodePreset.fingerprint, fingerprint),
      )).limit(1);
      return row ?? null;
    },
    list(userId, workspaceId) {
      return db.select().from(favoriteNodePreset).where(and(
        eq(favoriteNodePreset.userId, userId),
        eq(favoriteNodePreset.workspaceId, workspaceId),
      )).orderBy(desc(favoriteNodePreset.updatedAt));
    },
    async upsert(input) {
      const [row] = await db.insert(favoriteNodePreset).values(input).onConflictDoUpdate({
        target: [
          favoriteNodePreset.userId,
          favoriteNodePreset.workspaceId,
          favoriteNodePreset.fingerprint,
        ],
        set: {
          nodeType: input.nodeType,
          payload: input.payload,
          payloadBytes: input.payloadBytes,
          payloadVersion: input.payloadVersion,
          updatedAt: new Date(),
        },
      }).returning();
      if (!row) throw new Error('Favorite node preset could not be saved.');
      return row;
    },
  };
}
