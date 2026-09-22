import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/shared/db/client';
import { asset as assetTable } from '@/shared/db/schema/asset';
import { createDefaultUploadDependencies, storeThumbnailVariant } from '@/entities/asset/server/asset-storage-support';
import { readStoredMediaFile } from '@/shared/media/stored-media-file';
import { inspectVideoBytes } from '@/shared/media/video-processor';
import { inspectAudioBytes } from '@/shared/media/audio-processor';
import { MAX_VIDEO_BYTES, VideoProcessingError } from '@/shared/media/video-contracts';
import { MAX_AUDIO_BYTES, AudioProcessingError } from '@/shared/media/audio-contracts';
import { getMaxImageUploadBytes } from '@/entities/asset/server/asset-service';
import { validateImageBytes, AssetValidationError } from '@/shared/storage/image-policy';
import { GenerationExecutionError, type GenerationExecutor } from './generation-worker-contracts';
import { assertActiveGenerationAttempt, getGenerationExecutionRecord } from './generation-execution-repository';
import { createGenerationPayloadStore } from './generation-payload-store';
import { emptyUsage } from './generation-usage-recorder';

const requestSchema = z.object({ version: z.literal(1), assetId: z.uuid(), checksumSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const defaults = {
  dependencies: createDefaultUploadDependencies, readPayload: (key: string) => createGenerationPayloadStore().read(key),
  getRecord: getGenerationExecutionRecord, assertActive: assertActiveGenerationAttempt,
  inspectVideo: inspectVideoBytes, inspectAudio: inspectAudioBytes,
  async saveReady(id: string, jobId: string, attempt: number, patch: { contentType: string; width: number | null; height: number | null; metadata: Record<string, unknown> }) {
    const [ready] = await getDb().update(assetTable).set({ ...patch, status: 'ready', updatedAt: new Date() }).where(and(eq(assetTable.id, id), inArray(assetTable.status, ['pending', 'failed']),
      sql`exists (select 1 from generation_job where id = ${jobId}::uuid and status = 'running' and attempt_count = ${attempt} and cancel_requested_at is null and lease_expires_at > now())`)).returning({ id: assetTable.id });
    if (!ready) throw new Error('Upload status or lease changed.');
  },
};
export function createAssetIngestExecutor(overrides: Partial<typeof defaults> = {}): GenerationExecutor {
  const services = { ...defaults, ...overrides };
  return { async execute({ job, signal }) {
    if (job.operation !== 'asset_ingest' || job.provider !== 'local' || job.modelId !== 'media-inspection-v1' || !job.requestObjectKey) throw new Error('Invalid upload job.');
    const payload = requestSchema.parse(await services.readPayload(job.requestObjectKey));
    const execution = await services.getRecord(job.id), deps = services.dependencies();
    const record = await deps.repository.findAccessible(payload.assetId, execution.createdByUserId);
    if (!record || record.workspaceId !== job.workspaceId || record.documentId !== job.documentId
      || record.createdByUserId !== execution.createdByUserId || record.checksumSha256 !== payload.checksumSha256
      || job.metadata?.uploadAssetId !== record.id || job.metadata?.assetChecksum !== record.checksumSha256
      || !['uploaded', 'saved'].includes(record.origin) || record.status === 'deleted') throw new GenerationExecutionError({ code: 'invalid_upload_scope', message: 'Файл недоступен.', retryable: false });
    const active = async () => { signal.throwIfAborted(); await deps.assertAccess({ userId: execution.createdByUserId, workspaceId: job.workspaceId, documentId: job.documentId }); await services.assertActive(job.id, job.attemptCount, signal); };
    await active();
    if (record.status === 'ready') return { assetId: record.id, usage: emptyUsage() };
    const maxBytes = record.mediaKind === 'video' ? MAX_VIDEO_BYTES : record.mediaKind === 'audio' ? MAX_AUDIO_BYTES : getMaxImageUploadBytes();
    const object = await deps.objectStore.get({ bucket: record.bucket, key: record.storageKey });
    const source = await readStoredMediaFile({ body: object.body, byteSize: record.byteSize, checksumSha256: record.checksumSha256, maxBytes, signal });
    try {
      const options = { maxBytes, claimedContentType: record.contentType, signal };
      const inspected = record.mediaKind === 'video' ? await services.inspectVideo(source.bytes, options)
        : record.mediaKind === 'audio' ? await services.inspectAudio(source.bytes, options)
          : validateImageBytes(await readFile(source.bytes.path), options);
      await active();
      const thumbnail = 'video' in inspected ? await deps.createVideoThumbnail?.(source.bytes, signal)
        : 'buffer' in inspected ? await deps.createThumbnail?.(inspected.buffer) : undefined;
      await active();
      if (thumbnail) await storeThumbnailVariant(record, thumbnail, deps);
      const dimensions = 'video' in inspected ? inspected.video : 'buffer' in inspected ? inspected : undefined;
      await services.saveReady(record.id, job.id, job.attemptCount, { contentType: inspected.contentType,
        width: dimensions?.width ?? null, height: dimensions?.height ?? null,
        metadata: { ...record.metadata, ...('video' in inspected ? { video: inspected.video } : 'audio' in inspected ? { audio: inspected.audio } : {}) },
      });
      return { assetId: record.id, usage: emptyUsage() };
    } catch (error) {
      if (error instanceof AudioProcessingError || error instanceof VideoProcessingError || error instanceof AssetValidationError) {
        const retryable = 'status' in error && error.status === 503;
        if (!retryable) await deps.repository.markFailed(record.id, error.code);
        throw new GenerationExecutionError({ code: error.code, message: error.message, retryable });
      }
      throw error;
    } finally { await source.dispose(); }
  } };
}
