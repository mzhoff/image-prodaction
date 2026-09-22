import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, inArray } from 'drizzle-orm';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import sharp from 'sharp';
import * as schema from '@/shared/db/schema';
import { getDb } from '@/shared/db/client';
import { user } from '@/shared/db/schema/auth';
import { workspace, membership } from '@/shared/db/schema/workspace';
import { asset, assetVariant } from '@/shared/db/schema/asset';
import { generationJob } from '@/shared/db/schema/generation';
import { streamMediaFile } from '@/shared/media/media-source';
import { getAssetMetadata, getAssetContent } from '@/entities/asset/server/asset-service';
import { getAssetObjectStore, getConfiguredAssetBucket } from '@/shared/storage/s3-assets';
import { getGenerationJob, succeedGenerationJob } from '@/entities/generation/server/generation-orchestrator';
import { emptyTimeline } from '@/modules/story-projects/contracts/story-timeline';
import { createTimelineProduction } from '@/modules/story-projects/server/timeline-production-service';
import { saveTimeline } from '@/modules/story-projects/server/timeline-service';
import { createProductionGenerationExecutor } from './production-generation-executor';
import { createAssetIngestExecutor } from './asset-ingest-executor';
import { submitAssetIngest } from './asset-ingest-submission';
import { submitMontageJob, readMontageJob } from './montage-job-service';
import { createMontageExecutor } from './montage-executor';
import { DEFAULT_TIMELINE_MODEL } from '@/shared/api/timeline-models';

test('local PostgreSQL + S3: banner image ingestion through the production executor', { skip: process.env.MEDIA_LOCAL_INTEGRATION !== '1', timeout: 30_000 }, async () => {
  for (const value of [process.env.DATABASE_URL, process.env.S3_ENDPOINT]) assert.ok(value && ['localhost', '127.0.0.1'].includes(new URL(value).hostname), 'Local test services only');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL }), db = drizzle(pool, { schema });
  const holder = globalThis as typeof globalThis & { imageProdactionDb?: ReturnType<typeof getDb> };
  const previousDb = holder.imageProdactionDb;
  const directory = await mkdtemp(join(tmpdir(), 'banner-ingest-'));
  const owner = randomUUID(), space = randomUUID(), rollback = new Error('rollback fixture');
  const keys = new Set<string>();
  try {
    await db.transaction(async (tx) => {
      holder.imageProdactionDb = tx as unknown as ReturnType<typeof getDb>;
      try {
        await tx.insert(user).values({ id: owner, name: 'Banner upload QA', termsAcceptedAt: new Date(), termsVersion: 'test' });
        await tx.insert(workspace).values({ id: space, name: 'Banner upload QA', createdByUserId: owner });
        await tx.insert(membership).values({ workspaceId: space, userId: owner, role: 'owner' });
        const path = join(directory, 'banner.webp');
        await sharp({ create: { width: 160, height: 90, channels: 4, background: { r: 10, g: 50, b: 200, alpha: 0.5 } } }).webp().toFile(path);
        const file = await streamMediaFile(createReadStream(path), join(directory, 'upload'), 1024 * 1024);
        const accepted = await submitAssetIngest({ userId: owner, workspaceId: space, documentId: null, origin: 'uploaded', mediaKind: 'image', file: { ...file, name: 'banner.webp', type: 'image/webp' }, signal: AbortSignal.timeout(15_000) });
        assert.equal(accepted.asset.status, 'pending');
        await assert.rejects(getAssetContent(owner, accepted.asset.id), { name: 'AssetNotReadyError' });
        await tx.update(generationJob).set({ status: 'running', attemptCount: 1, startedAt: new Date(), leaseExpiresAt: new Date(Date.now() + 60_000) }).where(eq(generationJob.id, accepted.job.id));
        const job = await getGenerationJob(owner, accepted.job.id);
        const executor = createProductionGenerationExecutor();
        const result = await executor.execute({ job, signal: AbortSignal.timeout(15_000) });
        assert.equal(result.assetId, accepted.asset.id);
        const ready = await getAssetMetadata(owner, accepted.asset.id);
        assert.equal(ready.status, 'ready'); assert.equal(ready.width, 160); assert.equal(ready.height, 90);
        for (const purpose of [undefined, 'thumbnail'] as const) {
          const content = await getAssetContent(owner, accepted.asset.id, undefined, purpose);
          const bytes = Buffer.from(await new Response(content.object.body).arrayBuffer());
          const metadata = await sharp(bytes).metadata();
          assert.equal(metadata.format, 'webp'); assert.equal(metadata.hasAlpha, true);
          assert.equal(metadata.width, 160); assert.equal(metadata.height, 90);
        }
        assert.equal((await executor.execute({ job, signal: AbortSignal.timeout(5000) })).assetId, accepted.asset.id);
        const completion = { jobId: job.id, attemptCount: 1, assetId: result.assetId, usage: result.usage };
        for (const metadata of [
          { ...job.metadata, uploadAssetId: randomUUID() },
          { ...job.metadata, assetChecksum: '0'.repeat(64) },
        ]) {
          await tx.update(generationJob).set({ metadata }).where(eq(generationJob.id, job.id));
          await assert.rejects(succeedGenerationJob(completion), /Uploaded asset does not match/);
          assert.equal((await getGenerationJob(owner, job.id)).status, 'running', 'invalid completion rolls back');
        }
        await tx.update(generationJob).set({ metadata: job.metadata }).where(eq(generationJob.id, job.id));
        const completed = await succeedGenerationJob(completion);
        assert.equal(completed.status, 'succeeded'); assert.equal(completed.finalAssetId, accepted.asset.id);
        assert.equal((await getAssetMetadata(owner, accepted.asset.id)).origin, 'uploaded');
      } finally {
        for (const record of await tx.select().from(asset).where(eq(asset.workspaceId, space))) keys.add(record.storageKey);
        for (const record of await tx.select().from(assetVariant).where(inArray(assetVariant.assetId, tx.select({ id: asset.id }).from(asset).where(eq(asset.workspaceId, space))))) keys.add(record.storageKey);
        for (const record of await tx.select().from(generationJob).where(eq(generationJob.workspaceId, space))) if (record.requestObjectKey) keys.add(record.requestObjectKey);
      }
      throw rollback;
    }).catch((error) => { if (error !== rollback) throw error; });
  } finally {
    holder.imageProdactionDb = previousDb;
    for (const key of keys) await getAssetObjectStore().delete({ bucket: getConfiguredAssetBucket(), key });
    await pool.end(); await rm(directory, { recursive: true, force: true });
  }
});

test('local PostgreSQL + S3: pending uploads, durable inspection, local grid, explicit planning and stale-grid rejection', { skip: process.env.MEDIA_LOCAL_INTEGRATION !== '1', timeout: 60_000 }, async () => {
  for (const value of [process.env.DATABASE_URL, process.env.S3_ENDPOINT]) assert.ok(value && ['localhost', '127.0.0.1'].includes(new URL(value).hostname), 'Local test services only');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL }), db = drizzle(pool, { schema });
  const holder = globalThis as typeof globalThis & { imageProdactionDb?: ReturnType<typeof getDb> };
  const previousDb = holder.imageProdactionDb;
  const directory = await mkdtemp(join(tmpdir(), 'ingest-integration-'));
  const owner = randomUUID(), space = randomUUID(), rollback = new Error('rollback fixture');
  const keys = new Set<string>();
  try {
    await db.transaction(async (tx) => {
      holder.imageProdactionDb = tx as unknown as ReturnType<typeof getDb>;
      try {
        await tx.insert(user).values({ id: owner, name: 'Media stream QA', termsAcceptedAt: new Date(), termsVersion: 'test' });
        await tx.insert(workspace).values({ id: space, name: 'Media stream QA', createdByUserId: owner });
        await tx.insert(membership).values({ workspaceId: space, userId: owner, role: 'owner' });
        const ingest = createAssetIngestExecutor();
        const ingestIds: Record<string, string> = {};
        for (const kind of ['audio', 'video'] as const) {
          const path = join(directory, `${kind}.${kind === 'audio' ? 'wav' : 'mp4'}`);
          const args = kind === 'audio' ? ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000', '-t', '5'] : ['-f', 'lavfi', '-i', 'color=red:s=160x90:r=30', '-t', '5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p'];
          const generated = spawnSync(process.env.FFMPEG_PATH ?? 'ffmpeg', ['-v', 'error', ...args, path]); assert.equal(generated.status, 0);
          const file = await streamMediaFile(createReadStream(path), join(directory, `${kind}-upload`), 1024 * 1024);
          const accepted = await submitAssetIngest({ userId: owner, workspaceId: space, documentId: null, origin: 'uploaded', mediaKind: kind, file: { ...file, name: path.split('/').at(-1)!, type: kind === 'audio' ? 'audio/wav' : 'video/mp4' }, signal: AbortSignal.timeout(15_000) });
          assert.equal(accepted.asset.status, 'pending'); ingestIds[kind] = accepted.asset.id;
          await assert.rejects(getAssetContent(owner, accepted.asset.id), { name: 'AssetNotReadyError' });
          await tx.update(generationJob).set({ status: 'running', attemptCount: 1, startedAt: new Date(), leaseExpiresAt: new Date(Date.now() + 60_000) }).where(eq(generationJob.id, accepted.job.id));
          const job = await getGenerationJob(owner, accepted.job.id), result = await ingest.execute({ job, signal: AbortSignal.timeout(15_000) });
          assert.equal(result.assetId, accepted.asset.id); assert.equal((await getAssetMetadata(owner, accepted.asset.id)).status, 'ready');
          assert.equal((await ingest.execute({ job, signal: AbortSignal.timeout(5000) })).assetId, accepted.asset.id, 'replay reuses the validated asset');
          await tx.update(generationJob).set({ status: 'succeeded', finalAssetId: accepted.asset.id }).where(eq(generationJob.id, job.id));
        }
        const { timeline } = await createTimelineProduction(owner, { workspaceId: space, name: 'Promo', project: { mode: 'new', name: 'QA' }, snapshot: { ...emptyTimeline(), production: { purpose: 'promo', brief: 'Wave', pacing: 'normal', targetDurationMs: 5000, sourceAssetIds: [ingestIds.video] } } });
        const grid = await submitMontageJob(owner, timeline.id, { action: 'rhythm', expectedRevision: 0, idempotencyKey: 'grid', musicAssetId: ingestIds.audio, musicSourceInMs: 0, bpm: 120, beatOffsetMs: 0 }, { resolveCredential: async () => { throw new Error('Rhythm must not resolve provider credentials'); } });
        await tx.update(generationJob).set({ status: 'running', attemptCount: 1, startedAt: new Date(), leaseExpiresAt: new Date(Date.now() + 60_000) }).where(eq(generationJob.id, grid.job.id));
        await createMontageExecutor().execute({ job: await getGenerationJob(owner, grid.job.id), signal: AbortSignal.timeout(20_000) });
        await tx.update(generationJob).set({ status: 'succeeded' }).where(eq(generationJob.id, grid.job.id));
        assert.equal((await readMontageJob(owner, timeline.id, grid.job.id)).result?.kind, 'grid');
        let credentialCalls = 0;
        const plan = { action: 'plan' as const, expectedRevision: 0, idempotencyKey: 'plan', model: DEFAULT_TIMELINE_MODEL, gridJobId: grid.job.id };
        const provider = { resolveCredential: async () => { credentialCalls++; return {} as Awaited<ReturnType<NonNullable<Parameters<typeof submitMontageJob>[3]>['resolveCredential']>>; } };
        await submitMontageJob(owner, timeline.id, plan, provider); assert.equal(credentialCalls, 1);
        await saveTimeline(owner, timeline.id, 0, { name: 'Edited', folderId: timeline.folderId, storyboardId: null, snapshot: timeline.snapshot });
        await assert.rejects(submitMontageJob(owner, timeline.id, { ...plan, expectedRevision: 1, idempotencyKey: 'stale' }, provider), { code: 'stale_grid' });
        assert.equal(credentialCalls, 1);
      } finally {
        for (const record of await tx.select().from(asset).where(eq(asset.workspaceId, space))) keys.add(record.storageKey);
        for (const record of await tx.select().from(assetVariant).where(inArray(assetVariant.assetId, tx.select({ id: asset.id }).from(asset).where(eq(asset.workspaceId, space))))) keys.add(record.storageKey);
        for (const record of await tx.select().from(generationJob).where(eq(generationJob.workspaceId, space))) { if (record.requestObjectKey) keys.add(record.requestObjectKey); if (record.resultObjectKey) keys.add(record.resultObjectKey); }
      }
      throw rollback;
    }).catch((error) => { if (error !== rollback) throw error; });
  } finally {
    holder.imageProdactionDb = previousDb;
    for (const key of keys) await getAssetObjectStore().delete({ bucket: getConfiguredAssetBucket(), key });
    await pool.end(); await rm(directory, { recursive: true, force: true });
  }
});
