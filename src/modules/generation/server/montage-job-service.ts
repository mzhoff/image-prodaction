import { timelineVideoDuration } from '@/modules/story-projects/core/timeline-video';
import { getGenerationJob } from '@/entities/generation/server/generation-orchestrator';
import { getAssetMetadata } from '@/entities/asset/server/asset-service';
import { getTimeline, saveTimeline } from '@/modules/story-projects/server/timeline-service';
import { StoryError } from '@/modules/story-projects/server/story-service';
import { timelineAssetRequirements } from '@/modules/story-projects/core/timeline-media';
import { reviewMontageSlots } from '@/modules/story-projects/core/timeline-track-editing';
import { montageJobRequestSchema, type MontageJobRequest } from '@/modules/story-projects/contracts/timeline-production';
import { resolveOpenRouterCredential } from '@/modules/provider-connections/server/provider-connection-service';
import { cancelGenerationJob, submitGenerationJob, toPublicGenerationJob } from './generation-submission-service';
import { createGenerationPayloadStore } from './generation-payload-store';
import { readShortAiResultCheckpoint } from './short-ai-result-store';
import { analysisBasis, montageHash, montagePayloadSchema, montageResultSchema, type MontagePayload } from './montage-contracts';

export async function submitMontageJob(userId: string, timelineId: string, body: MontageJobRequest, dependencies = { resolveCredential: resolveOpenRouterCredential }) {
  const request = montageJobRequestSchema.parse(body), timeline = await getTimeline(userId, timelineId);
  if (request.expectedRevision !== timeline.revision) throw new StoryError('Монтаж изменился. Обновите документ перед запуском.', 409, 'revision_conflict');
  if (request.action !== 'render' && !timeline.snapshot.production) throw new StoryError('Укажите параметры промо.', 422, 'missing_promo_settings');
  if ((request.action === 'plan' || request.action === 'analyze') && !timeline.snapshot.production?.sourceAssetIds.length) throw new StoryError('Выберите исходные видео перед AI-автомонтажом.', 422, 'missing_promo_sources');
  const requirements = timelineAssetRequirements(timeline.snapshot);
  if ((request.action === 'analyze' || request.action === 'rhythm')) requirements.push({ id: request.musicAssetId, kind: 'audio', endMs: request.musicSourceInMs + timeline.snapshot.production!.targetDurationMs });
  const checksums: Record<string, string> = {};
  let sourceDuration = 0;
  for (const requirement of requirements) {
    const source = await getAssetMetadata(userId, requirement.id);
    if (source.workspaceId !== timeline.workspaceId || source.mediaKind !== requirement.kind || source.status !== 'ready') throw new StoryError('Исходник недоступен в Workspace.', 422, 'invalid_montage_source');
    const duration = requirement.kind === 'audio' ? source.audio?.durationSeconds : source.video?.durationSeconds;
    const silentTail = requirement.kind === 'audio' && 'allowSilentTail' in requirement && requirement.allowSilentTail;
    if ('endMs' in requirement && requirement.endMs !== undefined && (!duration || (!silentTail && requirement.endMs > duration * 1000))) throw new StoryError('Диапазон выходит за границы исходника.', 422, 'invalid_montage_range');
    if ((request.action === 'analyze' || request.action === 'plan') && timeline.snapshot.production!.sourceAssetIds.includes(source.id) && !checksums[source.id]) {
      if (!duration || duration > 300) throw new StoryError('Анализ одного видео ограничен пятью минутами.', 422, 'montage_analysis_limit');
      sourceDuration += duration;
    }
    checksums[source.id] = source.checksumSha256;
  }
  if (sourceDuration > 900) throw new StoryError('За один анализ можно обработать до 15 минут исходников.', 422, 'montage_analysis_limit');
  const payload: MontagePayload = { version: 1, userId, workspaceId: timeline.workspaceId, timelineId,
    name: timeline.name, revision: timeline.revision, snapshot: timeline.snapshot, request, checksums };
  if (request.action === 'analyze' && request.reuseAnalysisJobId) {
    const previous = await readMontageInternal(userId, timelineId, request.reuseAnalysisJobId);
    if (previous.job.status !== 'succeeded' || previous.result?.kind !== 'analysis' || !previous.result.analysis.complete
      || montageHash(previous.payload.snapshot.production?.sourceAssetIds) !== montageHash(timeline.snapshot.production?.sourceAssetIds)
      || previous.result.analysis.sources.some((source) => checksums[source.assetId] !== source.checksum)) throw new StoryError('Для повторного использования нужен анализ тех же исходников.', 409, 'stale_montage_analysis');
    payload.analysis = { ...previous.result.analysis, complete: false, music: null };
  }
  if (request.action === 'rhythm' && request.previousGridJobId) {
    const previous = await readMontageInternal(userId, timelineId, request.previousGridJobId);
    if (previous.job.status !== 'succeeded' || previous.result?.kind !== 'grid') throw new StoryError('Предыдущая сетка ещё не готова.', 409, 'stale_grid');
    const music = previous.result.music;
    if (music.assetId !== request.musicAssetId || music.checksum !== checksums[music.assetId] || music.sourceInMs !== request.musicSourceInMs || music.durationMs !== timeline.snapshot.production!.targetDurationMs) throw new StoryError('Выбран другой участок музыки. Проанализируйте его заново.', 409, 'stale_grid');
    payload.music = music;
  }
  if (request.action === 'plan') {
    const grid = await readMontageInternal(userId, timelineId, request.gridJobId);
    if (grid.job.status !== 'succeeded' || grid.result?.kind !== 'grid' || grid.payload.revision !== timeline.revision
      || montageHash(grid.payload.snapshot) !== montageHash(timeline.snapshot)) throw new StoryError('Монтаж изменился. Сначала пересчитайте и проверьте ячейки.', 409, 'stale_grid');
    if (grid.result.slots.length > 100) throw new StoryError('Сетка превышает 100 ячеек. Сократите ролик или выберите более спокойный монтаж.', 422, 'montage_slot_limit');
    payload.music = grid.result.music;
    try { payload.slots = request.slots ? reviewMontageSlots(grid.result.slots, request.slots) : grid.result.slots; }
    catch (error) { throw new StoryError(error instanceof Error ? error.message : 'Неверная сетка.', 422, 'invalid_reviewed_grid'); }
    const asset = await getAssetMetadata(userId, payload.music.assetId);
    if (asset.workspaceId !== timeline.workspaceId || asset.mediaKind !== 'audio' || asset.checksumSha256 !== payload.music.checksum || asset.status !== 'ready') throw new StoryError('Музыка изменилась.', 409, 'stale_montage_analysis');
    payload.checksums[asset.id] = asset.checksumSha256;
    if (request.analysisJobId) {
      const previous = await readMontageInternal(userId, timelineId, request.analysisJobId);
      const analysis = previous.result?.kind === 'analysis' || previous.result?.kind === 'proposal' ? previous.result.analysis : undefined;
      if (previous.job.status !== 'succeeded' || !analysis?.complete
        || analysisBasis(previous.payload.snapshot) !== analysisBasis(timeline.snapshot)
        || analysis.sources.some((source) => checksums[source.assetId] !== source.checksum)) throw new StoryError('Нужен анализ актуальных исходников.', 409, 'stale_montage_analysis');
      payload.analysis = { ...analysis, music: payload.music };
    }
  }
  if (request.action === 'plan' || request.action === 'analyze') await dependencies.resolveCredential(userId, timeline.workspaceId);
  if (request.action === 'render' && (!timeline.snapshot.clips.length || timeline.snapshot.clips.length > 100 || timelineVideoDuration(timeline.snapshot) > 300_000)) throw new StoryError('MP4: 1–100 клипов, до пяти минут.', 422, 'montage_render_limit');
  const job = await submitGenerationJob({ userId, workspaceId: timeline.workspaceId, documentId: null,
    idempotencyKey: `montage:${timelineId}:${request.idempotencyKey}`, provider: request.action === 'render' || request.action === 'rhythm' ? 'local' : 'openrouter',
    modelId: request.action === 'render' ? 'ffmpeg-montage-v1' : request.action === 'rhythm' ? 'music-rhythm-v1' : request.model, operation: `montage_${request.action}`, maxAttempts: 2,
    payload, metadata: { requestHash: montageHash(payload), timelineId, timelineRevision: timeline.revision, assetChecksums: checksums } });
  return { job: toPublicGenerationJob(job), statusUrl: `/api/stories/timelines/${timelineId}/jobs/${job.id}` };
}

export async function readMontageInternal(userId: string, timelineId: string, jobId: string) {
  const timeline = await getTimeline(userId, timelineId), job = await getGenerationJob(userId, jobId);
  if (!['montage_analyze', 'montage_plan', 'montage_render', 'montage_rhythm'].includes(job.operation) || job.workspaceId !== timeline.workspaceId
    || job.metadata?.timelineId !== timelineId || !job.requestObjectKey) throw new StoryError('Задача монтажа не найдена.', 404, 'montage_job_not_found');
  const payload = montagePayloadSchema.parse(await createGenerationPayloadStore().read(job.requestObjectKey));
  if (payload.timelineId !== timelineId || payload.workspaceId !== timeline.workspaceId || montageHash(payload) !== job.metadata.requestHash) throw new StoryError('Неверный контекст задачи.', 409, 'montage_job_mismatch');
  const result = job.resultObjectKey ? montageResultSchema.parse(await readShortAiResultCheckpoint(job.resultObjectKey)) : null;
  return { timeline, job, payload, result };
}
export async function readMontageJob(userId: string, timelineId: string, jobId: string) {
  const { job, result } = await readMontageInternal(userId, timelineId, jobId);
  return { job: toPublicGenerationJob(job), result: job.cancelRequestedAt ? null : result,
    downloadUrl: job.status === 'succeeded' && result?.kind === 'render' ? `/api/stories/timelines/${timelineId}/jobs/${jobId}/download` : null };
}
export async function cancelMontageJob(userId: string, timelineId: string, jobId: string) {
  await readMontageInternal(userId, timelineId, jobId);
  return { job: toPublicGenerationJob(await cancelGenerationJob(userId, jobId)) };
}
export async function applyMontageJob(userId: string, timelineId: string, jobId: string, expectedRevision: number) {
  const { job, result, payload, timeline } = await readMontageInternal(userId, timelineId, jobId);
  if (job.status !== 'succeeded' || result?.kind !== 'proposal') throw new StoryError('Предложение ещё не готово.', 409, 'montage_not_ready');
  if (expectedRevision !== payload.revision || timeline.revision !== payload.revision) throw new StoryError('Монтаж изменён после запроса. Создайте новое предложение.', 409, 'revision_conflict');
  return saveTimeline(userId, timelineId, expectedRevision, { name: timeline.name, folderId: timeline.folderId, storyboardId: timeline.storyboardId, snapshot: result.snapshot });
}
