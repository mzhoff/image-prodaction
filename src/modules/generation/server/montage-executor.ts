import { timelineVideoSegments } from '@/modules/story-projects/core/timeline-video';
import { prepareMontageRhythm, analyzeForMontagePlan } from './montage-rhythm';
import { z } from 'zod';
import { getAssetContent, getGeneratedAssetByJobId, AssetStorageError } from '@/entities/asset/server/asset-service';
import { persistAuthorizedVideoAsset } from '@/entities/asset/server/video-asset-service';
import { getTimeline } from '@/modules/story-projects/server/timeline-service';
import { StoryError } from '@/modules/story-projects/server/story-service';
import { readStoredMediaFile } from '@/shared/media/stored-media-file';
import { AudioProcessingError } from '@/shared/media/audio-contracts';
import { VideoProcessingError, MAX_VIDEO_BYTES, MAX_VIDEO_OUTPUT_BYTES } from '@/shared/media/video-contracts';
import { renderMontage } from '@/shared/media/montage-render';
import { ProviderAdapterError } from '@/modules/provider-connections/core/provider-errors';
import { assertActiveGenerationAttempt, getGenerationExecutionRecord } from './generation-execution-repository';
import { createGenerationPayloadStore } from './generation-payload-store';
import { emptyUsage } from './generation-usage-recorder';
import { GenerationExecutionError, type GenerationExecutor } from './generation-worker-contracts';
import { ShortAiExecutionError } from './short-ai-execution-contracts';
import { readShortAiResultCheckpoint, saveShortAiResultCheckpoint } from './short-ai-result-store';
import { montageHash, montagePayloadSchema, montageResultSchema, type MontageResult } from './montage-contracts';
import { analyzeMontage } from './montage-analysis';
import { planMontage } from './montage-planning';

const defaults = {
  getTimeline, assertActive: assertActiveGenerationAttempt, getRecord: getGenerationExecutionRecord,
  readPayload: (key: string) => createGenerationPayloadStore().read(key),
  readResult: readShortAiResultCheckpoint, saveResult: saveShortAiResultCheckpoint,
  getContent: getAssetContent, findAsset: getGeneratedAssetByJobId, persist: persistAuthorizedVideoAsset,
  analyze: analyzeMontage, plan: planMontage, render: renderMontage,
};
export function createMontageExecutor(overrides: Partial<typeof defaults> = {}): GenerationExecutor {
  const deps = { ...defaults, ...overrides };
  return { async execute({ job, signal }) {
    if (!['montage_analyze', 'montage_plan', 'montage_render', 'montage_rhythm'].includes(job.operation) || !job.requestObjectKey) throw failure('invalid_montage_job', 'Запрос монтажа отсутствует.');
    await deps.assertActive(job.id, job.attemptCount, signal);
    const record = await deps.getRecord(job.id), payload = montagePayloadSchema.parse(await deps.readPayload(job.requestObjectKey));
    if (payload.userId !== record.createdByUserId || payload.workspaceId !== job.workspaceId || job.documentId !== null
      || payload.timelineId !== job.metadata?.timelineId || montageHash(payload) !== job.metadata?.requestHash
      || job.operation !== `montage_${payload.request.action}` || job.provider !== (payload.request.action === 'render' || payload.request.action === 'rhythm' ? 'local' : 'openrouter')
      || job.modelId !== (payload.request.action === 'render' ? 'ffmpeg-montage-v1' : payload.request.action === 'rhythm' ? 'music-rhythm-v1' : payload.request.model)) throw failure('montage_scope_mismatch', 'Контекст задания не совпадает с сохранённым запросом.');
    const remaining = 20 * 60 * 1000 - (Date.now() - Date.parse(job.startedAt ?? ''));
    if (!Number.isFinite(remaining) || remaining <= 0) throw failure('montage_timeout', 'Истекло 20-минутное окно обработки.');
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(remaining)]);
    const active = async () => {
      bounded.throwIfAborted(); await deps.assertActive(job.id, job.attemptCount, bounded);
      const timeline = await deps.getTimeline(payload.userId, payload.timelineId);
      if (timeline.workspaceId !== payload.workspaceId) throw failure('montage_scope_mismatch', 'Workspace монтажа изменился.');
    };
    const checkpoint = async (value: MontageResult) => {
      await active();
      const checked = montageResultSchema.parse(value);
      try {
        await deps.saveResult({ jobId: job.id, attemptCount: job.attemptCount, workspaceId: job.workspaceId, providerOperationId: null, payload: checked });
      } catch {
        await active();
        throw new GenerationExecutionError({ code: 'montage_checkpoint_unavailable', message: 'Сохранение результата прервалось. Повтор продолжит то же задание.', retryable: true });
      }
    };
    const load = async (assetId: string) => {
      await active();
      if (!payload.checksums[assetId]) throw failure('montage_unbound_asset', 'Исходник не включён в сохранённый запрос.');
      const content = await deps.getContent(payload.userId, assetId);
      if (content.asset.workspaceId !== payload.workspaceId || content.asset.checksumSha256 !== payload.checksums[assetId]) throw failure('montage_source_changed', 'Исходник изменился или недоступен.');
      const source = await readStoredMediaFile({ body: content.object.body, byteSize: content.byteSize, checksumSha256: payload.checksums[assetId], maxBytes: MAX_VIDEO_BYTES, signal: bounded });
      return { ...source, video: content.asset.video ?? undefined };
    };
    try {
      await active();
      const previous = record.resultObjectKey ? montageResultSchema.parse(await deps.readResult(record.resultObjectKey)) : null;
      const kind = payload.request.action === 'plan' ? 'proposal' : payload.request.action === 'analyze' ? 'analysis' : payload.request.action === 'rhythm' ? 'grid' : 'render';
      if (previous && previous.kind !== kind && !(payload.request.action === 'plan' && previous.kind === 'analysis')) throw failure('montage_checkpoint_mismatch', 'Сохранён результат другого действия.');
      if (previous?.kind === 'analysis' && (previous.analysis.sources.some((s) => payload.checksums[s.assetId] !== s.checksum)
        || (previous.analysis.music && ((payload.request.action !== 'analyze' && payload.request.action !== 'plan') || previous.analysis.music.assetId !== (payload.request.action === 'analyze' ? payload.request.musicAssetId : payload.music?.assetId)
          || previous.analysis.music.checksum !== payload.checksums[previous.analysis.music.assetId])))) throw failure('montage_checkpoint_mismatch', 'Сохранён анализ других исходников.');
      if (previous?.kind === 'render') {
        const asset = await deps.findAsset(job.id);
        if (!asset || asset.id !== previous.assetId || asset.workspaceId !== job.workspaceId || asset.status !== 'ready') throw failure('montage_result_scope', 'Готовое видео недоступно.');
      }
      if (previous && (previous.kind !== 'analysis' || (previous.analysis.complete && payload.request.action === 'analyze'))) return { ...(previous.kind === 'render' ? { assetId: previous.assetId } : {}), usage: emptyUsage() };
      if (payload.request.action === 'rhythm') {
        await checkpoint(await prepareMontageRhythm(payload, load, bounded));
      } else if (payload.request.action === 'analyze') {
        await deps.analyze({ payload, jobId: job.id, signal: bounded, load, assertActive: active,
          previous: previous?.kind === 'analysis' ? previous.analysis : undefined,
          checkpoint: (analysis) => checkpoint({ kind: 'analysis', analysis }) });
      } else if (payload.request.action === 'plan') {
        payload.analysis = await analyzeForMontagePlan({ payload, jobId: job.id, signal: bounded, load, assertActive: active, previous: previous?.kind === 'analysis' ? previous.analysis : undefined, checkpoint: (analysis) => checkpoint({ kind: 'analysis', analysis }) }, deps.analyze);
        await active();
        await checkpoint(await deps.plan(payload, job.id, bounded));
      } else {
        let asset = await deps.findAsset(job.id);
        if (asset && (asset.workspaceId !== payload.workspaceId || asset.mediaKind !== 'video' || asset.operation !== 'montage_render')) throw failure('montage_result_scope', 'Сохранён результат другого задания.');
        if (asset?.status !== 'ready') {
          const rendered = await deps.render({ ...payload.snapshot, clips: timelineVideoSegments(payload.snapshot) }, load, bounded); await active();
          const hash = montageHash(['montage', job.id]);
          // Match existing deterministic derivative ids and the asset API's UUIDv7 contract.
          const requestedAssetId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-7${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
          asset = await deps.persist({ bytes: rendered.bytes, maxBytes: MAX_VIDEO_OUTPUT_BYTES, signal: bounded, requestedAssetId, userId: payload.userId,
            workspaceId: payload.workspaceId, documentId: null, origin: 'generated', libraryVisible: true,
            generationJobId: job.id, operation: 'montage_render', modelId: job.modelId, provider: 'local',
            originalName: `${payload.name}.mp4`, metadata: { timelineId: payload.timelineId, timelineRevision: payload.revision } }, rendered);
        }
        await checkpoint({ kind: 'render', assetId: asset.id, durationMs: asset.video!.durationSeconds * 1000, frameRate: payload.snapshot.frameRate ?? 30 });
        return { assetId: asset.id, usage: emptyUsage() };
      }
      await active(); return { usage: emptyUsage() };
    } catch (error) {
      if (error instanceof GenerationExecutionError) throw error;
      if (error instanceof AssetStorageError) throw new GenerationExecutionError({ code: 'montage_storage_unavailable', message: 'Хранилище временно недоступно. Повтор продолжит то же задание.', retryable: true });
      if (error instanceof ShortAiExecutionError || error instanceof ProviderAdapterError) throw failure(error.descriptor.code, error.descriptor.message);
      if (error instanceof VideoProcessingError || error instanceof AudioProcessingError) throw new GenerationExecutionError({ code: error.code, message: error.message, retryable: ['audio_busy', 'video_busy', 'timeline_busy'].includes(error.code) });
      if (error instanceof StoryError) throw failure(error.code, error.message);
      if (bounded.aborted && !signal.aborted) throw failure('montage_timeout', 'Истекло 20-минутное окно обработки.');
      if (signal.aborted) throw error;
      if (error instanceof z.ZodError) throw failure('invalid_montage_result', 'Получены недопустимые данные монтажа.');
      throw failure('montage_failed', error instanceof Error ? error.message : 'Не удалось собрать монтаж.');
    }
  } };
}
function failure(code: string, message: string) { return new GenerationExecutionError({ code, message, retryable: false }); }
