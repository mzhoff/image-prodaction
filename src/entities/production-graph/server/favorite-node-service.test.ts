import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  FavoriteNodeRecord,
  FavoriteNodeRepository,
  SaveFavoriteNodeRecord,
} from './favorite-node-repository';
import {
  deleteFavoriteNode,
  FavoriteNodeNotFoundError,
  listFavoriteNodes,
  saveFavoriteNode,
} from './favorite-node-service';

const workspaceId = '01900000-0000-7000-8000-000000000001';

test('favorite service scopes list and delete to the authenticated user and workspace', async () => {
  const repository = createMemoryRepository();
  const dependencies = createDependencies(repository);
  await saveFavoriteNode({
    data: { text: 'Private preset', title: 'Notes' },
    nodeType: 'textPrompt',
    userId: 'user-1',
    workspaceId,
  }, dependencies);

  const own = await listFavoriteNodes({ userId: 'user-1', workspaceId }, dependencies);
  const other = await listFavoriteNodes({ userId: 'user-2', workspaceId }, dependencies);
  assert.equal(own.length, 1);
  assert.equal(other.length, 0);

  await assert.rejects(
    deleteFavoriteNode({ favoriteId: own[0]!.id, userId: 'user-2', workspaceId }, dependencies),
    FavoriteNodeNotFoundError,
  );
  assert.equal((await listFavoriteNodes({ userId: 'user-1', workspaceId }, dependencies)).length, 1);
  await deleteFavoriteNode({ favoriteId: own[0]!.id, userId: 'user-1', workspaceId }, dependencies);
  assert.equal((await listFavoriteNodes({ userId: 'user-1', workspaceId }, dependencies)).length, 0);
});

test('favorite service only keeps asset references proven accessible in the selected workspace', async () => {
  const repository = createMemoryRepository();
  const dependencies = createDependencies(repository, async (_userId, assetId) => ({
    status: 'ready',
    workspaceId: assetId === 'asset-allowed' ? workspaceId : '01900000-0000-7000-8000-000000000099',
  }));
  const result = await saveFavoriteNode({
    data: {
      model: 'image-model',
      resultAssetId: 'asset-denied',
      resultAssetIds: ['asset-allowed', 'asset-denied'],
      title: 'Reusable generator',
    },
    nodeType: 'generateImage',
    userId: 'user-1',
    workspaceId,
  }, dependencies);

  assert.equal(result.strippedAssetReferenceCount, 1);
  const data = result.favorite.snapshot.data as {
    resultAssetId?: string;
    resultAssetIds?: string[];
  };
  assert.equal(data.resultAssetId, 'asset-allowed');
  assert.deepEqual(data.resultAssetIds, ['asset-allowed']);
});

function createDependencies(
  repository: FavoriteNodeRepository,
  getAsset: (userId: string, assetId: string) => Promise<{ status: string; workspaceId: string }>
    = async () => { throw new Error('Asset not found.'); },
) {
  let sequence = 1;
  return {
    createId: () => `01900000-0000-7000-8000-${String(sequence++).padStart(12, '0')}`,
    getAsset,
    repository,
    requireMembership: async () => undefined,
  };
}

function createMemoryRepository(): FavoriteNodeRepository {
  const records: FavoriteNodeRecord[] = [];
  return {
    async count(userId, targetWorkspaceId) {
      return records.filter((record) => record.userId === userId
        && record.workspaceId === targetWorkspaceId).length;
    },
    async delete(id, userId, targetWorkspaceId) {
      const index = records.findIndex((record) => record.id === id
        && record.userId === userId && record.workspaceId === targetWorkspaceId);
      if (index < 0) return false;
      records.splice(index, 1);
      return true;
    },
    async findByFingerprint(userId, targetWorkspaceId, fingerprint) {
      return records.find((record) => record.userId === userId
        && record.workspaceId === targetWorkspaceId && record.fingerprint === fingerprint) ?? null;
    },
    async list(userId, targetWorkspaceId) {
      return records.filter((record) => record.userId === userId
        && record.workspaceId === targetWorkspaceId);
    },
    async upsert(input: SaveFavoriteNodeRecord) {
      const now = new Date('2026-08-21T00:00:00.000Z');
      const existingIndex = records.findIndex((record) => record.userId === input.userId
        && record.workspaceId === input.workspaceId && record.fingerprint === input.fingerprint);
      const record: FavoriteNodeRecord = { ...input, createdAt: now, updatedAt: now };
      if (existingIndex >= 0) records[existingIndex] = record;
      else records.push(record);
      return record;
    },
  };
}
