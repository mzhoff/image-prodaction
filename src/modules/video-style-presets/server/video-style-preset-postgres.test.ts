import assert from 'node:assert/strict';
import test from 'node:test';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb, getPostgresPool } from '@/shared/db/client';
import { user } from '@/shared/db/schema/auth';
import { asset } from '@/shared/db/schema/asset';
import { workspace, membership } from '@/shared/db/schema/workspace';
import { createUuidV7 } from '@/shared/lib/id';
import { DEFAULT_VIDEO_STYLE } from '@/shared/media/home-video-direction';
import { deleteVideoStylePreset, listVideoStylePresets, saveVideoStylePreset } from './video-style-preset-service';
import { WorkspaceAccessError } from '@/entities/workspace/server/workspace-service';

test('Postgres: workspace isolation, optimistic revisions and deletion preserve the gallery', {
  skip: !process.env.VIDEO_STYLE_TEST_DATABASE_URL,
}, async () => {
  const connection = new URL(process.env.VIDEO_STYLE_TEST_DATABASE_URL!);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(connection.hostname), 'This fixture test only runs against a local database.');
  process.env.DATABASE_URL = connection.toString();
  const db = getDb();
  const workspaceIds = [createUuidV7(), createUuidV7()];
  const userIds = [createUuidV7(), createUuidV7()];
  const coverIds = [createUuidV7(), createUuidV7()];
  const presetId = createUuidV7();
  try {
    await db.insert(user).values(userIds.map((id) => ({ id, name: 'Style preset QA', termsAcceptedAt: new Date(), termsVersion: 'qa' })));
    await db.insert(workspace).values(workspaceIds.map((id, index) => ({ id, name: 'Style preset QA', kind: 'team' as const, createdByUserId: userIds[index] })));
    await db.insert(membership).values(workspaceIds.map((workspaceId, index) => ({ workspaceId, userId: userIds[index], role: 'owner' as const })));
    await db.insert(asset).values(coverIds.map((id, index) => ({ id, workspaceId: workspaceIds[index], createdByUserId: userIds[index],
      bucket: 'qa-metadata-only', storageKey: id, originalName: 'QA cover', contentType: 'image/png', byteSize: 1,
      checksumSha256: '0'.repeat(64), status: 'ready' as const, mediaKind: 'image' as const, libraryVisible: true })));
    const input = { name: 'QA style', style: { ...DEFAULT_VIDEO_STYLE, prompt: 'Warm soft light' }, coverAssetId: coverIds[0], expectedRevision: 0 };
    await assert.rejects(saveVideoStylePreset(userIds[1], workspaceIds[0], presetId, input), WorkspaceAccessError);
    await assert.rejects(saveVideoStylePreset(userIds[0], workspaceIds[0], presetId, { ...input, coverAssetId: coverIds[1] }), /Library этого пространства/);
    const first = await saveVideoStylePreset(userIds[0], workspaceIds[0], presetId, input);
    assert.equal(first.revision, 1);
    assert.equal((await listVideoStylePresets(userIds[0], workspaceIds[0])).length, 1);
    assert.equal((await listVideoStylePresets(userIds[1], workspaceIds[1])).length, 0);
    await assert.rejects(saveVideoStylePreset(userIds[0], workspaceIds[0], presetId, input), /уже изменён/);
    await assert.rejects(saveVideoStylePreset(userIds[1], workspaceIds[1], presetId, { ...input, coverAssetId: null, expectedRevision: 1 }), /уже изменён/);
    const second = await saveVideoStylePreset(userIds[0], workspaceIds[0], presetId, { ...input, expectedRevision: 1, name: 'Updated' });
    assert.equal(second.revision, 2);
    await assert.rejects(deleteVideoStylePreset(userIds[0], workspaceIds[0], presetId, 1), /уже изменён/);
    await assert.rejects(deleteVideoStylePreset(userIds[1], workspaceIds[1], presetId, 2), /уже изменён/);
    await deleteVideoStylePreset(userIds[0], workspaceIds[0], presetId, 2);
    assert.equal((await listVideoStylePresets(userIds[0], workspaceIds[0])).length, 0);
    const [cover] = await db.select({ status: asset.status, libraryVisible: asset.libraryVisible }).from(asset)
      .where(and(eq(asset.id, coverIds[0]), eq(asset.workspaceId, workspaceIds[0])));
    assert.deepEqual(cover, { status: 'ready', libraryVisible: true });
  } finally {
    await db.delete(workspace).where(inArray(workspace.id, workspaceIds));
    await db.delete(user).where(inArray(user.id, userIds));
    await getPostgresPool().end();
  }
});
