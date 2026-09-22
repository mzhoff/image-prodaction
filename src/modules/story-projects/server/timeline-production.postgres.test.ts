import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/shared/db/schema';
import { asset } from '@/shared/db/schema/asset';
import { generationJob } from '@/shared/db/schema/generation';
import { user } from '@/shared/db/schema/auth';
import { membership, workspace } from '@/shared/db/schema/workspace';
import { studioFolder } from '@/shared/db/schema/studio-folder';
import { excludeStoryTimelineAssets } from '@/entities/asset/server/story-timeline-asset-retention';
import { createTimelineProduction } from './timeline-production-service';
import { getTimeline, saveTimeline } from './timeline-service';
import { createStory } from './story-service';
import { createStorySnapshot, settingsForFormat } from '../core/story-presets';
import { emptyTimeline } from '../contracts/story-timeline';

test('PostgreSQL: atomic project creation, audio isolation/ranges, legacy merge, CAS and source retention', { skip: !process.env.STORIES_TEST_DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: process.env.STORIES_TEST_DATABASE_URL });
  const db = drizzle(pool, { schema }), rollback = new Error('rollback fixture');
  const owner = randomUUID(), other = randomUUID(), space = randomUUID(), foreignSpace = randomUUID(), videoId = randomUUID(), audioId = randomUUID(), foreignAudio = randomUUID(), orphanId = randomUUID();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(user).values([owner, other].map((id) => ({ id, name: 'Montage test', termsAcceptedAt: new Date(), termsVersion: 'test' })));
      await tx.insert(workspace).values([{ id: space, name: 'Montage test', createdByUserId: owner }, { id: foreignSpace, name: 'Foreign test', createdByUserId: other }]);
      await tx.insert(membership).values([{ workspaceId: space, userId: owner, role: 'owner' }, { workspaceId: foreignSpace, userId: other, role: 'owner' }]);
      for (const [id, kind, workspaceId] of [[videoId, 'video', space], [audioId, 'audio', space], [orphanId, 'audio', space], [foreignAudio, 'audio', foreignSpace]] as const) {
        await tx.insert(asset).values({ id, mediaKind: kind, workspaceId, createdByUserId: workspaceId === space ? owner : other,
          bucket: 'test', storageKey: id, originalName: id, contentType: kind === 'video' ? 'video/mp4' : 'audio/wav', byteSize: 128,
          width: kind === 'video' ? 160 : null, height: kind === 'video' ? 90 : null, checksumSha256: 'a'.repeat(64), status: 'ready',
          metadata: { [kind]: { durationSeconds: 10 } } });
      }
      const storyboard = await createStory(owner, space, { name: 'Source storyboard', folderId: null, snapshot: createStorySnapshot(settingsForFormat('free')) }, tx);
      const layerId = randomUUID();
      const input = { storyboardId: storyboard.id, creationId: randomUUID(), workspaceId: space, name: 'Promo', project: { mode: 'new', name: 'New project' }, snapshot: {
        ...emptyTimeline(), videoTracks: [{ id: layerId, name: 'Второй план' }], clips: [{ id: randomUUID(), assetId: videoId, kind: 'video' as const, sourceInMs: 0, durationMs: 5000, shotId: null }, { id: randomUUID(), assetId: videoId, kind: 'video' as const, trackId: layerId, startMs: 500, sourceInMs: 5000, durationMs: 1000, shotId: null }],
        audioClips: [{ id: randomUUID(), assetId: audioId, startMs: 0, sourceInMs: 1000, durationMs: 5000, gain: 0.5 }],
      } };
      const created = await createTimelineProduction(owner, input, tx);
      assert.equal(created.timeline.folderId, created.folderId);
      assert.equal(created.timeline.storyboardId, storyboard.id);
      const replayed = await createTimelineProduction(owner, input, tx);
      assert.equal(replayed.timeline.id, created.timeline.id);
      assert.equal(replayed.folderId, created.folderId);
      assert.equal((await tx.select().from(studioFolder).where(eq(studioFolder.workspaceId, space))).length, 1);
      await assert.rejects(createTimelineProduction(owner, { ...input, creationId: randomUUID(), snapshot: { ...input.snapshot, audioClips: [{ ...input.snapshot.audioClips[0], assetId: foreignAudio }] } }, tx), /недоступен/);
      assert.equal((await tx.select().from(studioFolder).where(eq(studioFolder.workspaceId, space))).length, 1, 'failed creation rolled back its project');
      await assert.rejects(getTimeline(other, created.timeline.id, tx), /не найден/);
      const write = { name: 'Edited', folderId: created.folderId, storyboardId: null, snapshot: { ...emptyTimeline(), clips: input.snapshot.clips } };
      const saved = await saveTimeline(owner, created.timeline.id, 0, write, tx);
      assert.equal(saved.snapshot.audioClips?.[0].gain, 0.5);
      assert.deepEqual(saved.snapshot.videoTracks, input.snapshot.videoTracks);
      assert.equal(saved.snapshot.clips[1].startMs, 500);
      assert.equal((await getTimeline(owner, saved.id, tx)).snapshot.clips[1].trackId, layerId);
      await assert.rejects(saveTimeline(owner, saved.id, 0, write, tx), /другой вкладке/);
      await assert.rejects(saveTimeline(owner, saved.id, 1, { ...write, snapshot: { ...input.snapshot, audioClips: [{ ...input.snapshot.audioClips[0], sourceInMs: 9000 }] } }, tx), /Диапазон/);
      const eligible = async (id: string) => (await tx.select({ id: asset.id }).from(asset).where(and(eq(asset.id, id), excludeStoryTimelineAssets()))).length > 0;
      assert.equal(await eligible(videoId), false); assert.equal(await eligible(audioId), false); assert.equal(await eligible(orphanId), true);
      const jobId = randomUUID();
      await tx.insert(generationJob).values({ id: jobId, workspaceId: space, createdByUserId: owner, provider: 'local', modelId: 'test', operation: 'montage_analyze', idempotencyKey: jobId,
        metadata: { assetChecksums: { [orphanId]: 'a'.repeat(64) } } });
      assert.equal(await eligible(orphanId), false);
      await tx.update(generationJob).set({ status: 'canceled' }).where(eq(generationJob.id, jobId));
      assert.equal(await eligible(orphanId), true);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  finally { await pool.end(); }
});
