import { z } from 'zod';
import { AudioProcessingError } from '@/shared/media/audio-contracts';
import { VideoProcessingError } from '@/shared/media/video-contracts';
import { ProviderAdapterError } from '@/modules/provider-connections/core/provider-errors';
import { requireWorkspaceMembership } from '@/entities/workspace/server/workspace-service';
import { assertActiveGenerationAttempt, getGenerationExecutionRecord } from './generation-execution-repository';
import { createGenerationPayloadStore } from './generation-payload-store';
import { emptyUsage } from './generation-usage-recorder';
import { GenerationExecutionError, type GenerationExecutor } from './generation-worker-contracts';
import { ShortAiExecutionError } from './short-ai-execution-contracts';
import { readShortAiResultCheckpoint, saveShortAiResultCheckpoint } from './short-ai-result-store';
import { generateTimeline, timelinePayloadHash, type QueuedTimelinePayload, type TimelineResult } from './timeline-generation';
import { parseTimelineResult } from './timeline-job-service';
import { saveTimelineAnalysisProgress } from './timeline-progress-store';

const MAX_JOB_MS = 20 * 60 * 1000;
export function createTimelineGenerationExecutor(dependencies = {
  authorize: async (userId: string, workspaceId: string) => { await requireWorkspaceMembership(userId, workspaceId); },
  assertActive: assertActiveGenerationAttempt, getRecord: getGenerationExecutionRecord,
  readPayload: (key: string) => createGenerationPayloadStore().read<QueuedTimelinePayload>(key),
  readResult: readShortAiResultCheckpoint, saveResult: saveShortAiResultCheckpoint, generate: generateTimeline,
  saveProgress: saveTimelineAnalysisProgress,
}): GenerationExecutor {
  return { async execute({ job, signal }) {
    if (!['timeline_analyze', 'timeline_describe'].includes(job.operation) || !job.requestObjectKey) throw failure('invalid_timeline_job', 'The queued Timeline request is invalid.');
    await dependencies.assertActive(job.id, job.attemptCount, signal);
    const record = await dependencies.getRecord(job.id);
    const assertActive = async () => {
      await dependencies.assertActive(job.id, job.attemptCount, signal);
      await dependencies.authorize(record.createdByUserId, job.workspaceId);
    };
    await assertActive();
    const payload = await dependencies.readPayload(job.requestObjectKey);
    if (payload.userId !== record.createdByUserId || payload.request.workspaceId !== job.workspaceId || payload.request.documentId !== job.documentId
      || timelinePayloadHash(payload) !== job.metadata?.requestHash || job.metadata?.timelineVersion !== 1
      || job.operation !== `timeline_${payload.request.action}`
      || job.provider !== (payload.request.action === 'describe' ? 'openrouter' : 'local')
      || job.modelId !== (payload.request.action === 'describe' ? payload.request.model : 'ffmpeg-scdet-v1')) throw failure('timeline_scope_mismatch', 'The saved Timeline request does not match its job.');
    const startedAt = Date.parse(job.startedAt ?? '');
    const remaining = MAX_JOB_MS - (Date.now() - startedAt);
    if (!Number.isFinite(remaining) || remaining <= 0) throw failure('timeline_timeout', 'Timeline processing exceeded its 20-minute window.');
    const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(remaining)]);
    try {
      const previous = record.resultObjectKey ? parseTimelineResult(job.operation, await dependencies.readResult(record.resultObjectKey)) : null;
      if (previous && (previous.sourceAssetId !== payload.request.assetId || previous.sourceChecksum !== payload.sourceChecksum)) {
        throw failure('timeline_checkpoint_mismatch', 'The saved Timeline result belongs to a different source.');
      }
      if (job.operation === 'timeline_analyze' && previous) return { usage: emptyUsage() };
      const checkpoint = async (result: TimelineResult) => {
        boundedSignal.throwIfAborted(); await assertActive();
        await dependencies.saveResult({ jobId: job.id, attemptCount: job.attemptCount, workspaceId: job.workspaceId,
          providerOperationId: null, payload: result });
      };
      await dependencies.generate({ payload, jobId: job.id, signal: boundedSignal, previous, assertActive, checkpoint,
        onProgress: async (value) => { boundedSignal.throwIfAborted(); await assertActive(); await dependencies.saveProgress({ jobId: job.id, attemptCount: job.attemptCount, value }); } });
      await assertActive();
      // Usage is recorded on individual paid description jobs, never duplicated on the parent.
      return { usage: emptyUsage() };
    } catch (error) {
      if (error instanceof ShortAiExecutionError || error instanceof ProviderAdapterError) throw failure(error.descriptor.code, error.descriptor.message);
      if (error instanceof VideoProcessingError || error instanceof AudioProcessingError) throw new GenerationExecutionError({ code: error.code,
        message: error.message, retryable: ['audio_busy', 'video_busy', 'timeline_busy'].includes(error.code) });
      if (error instanceof z.ZodError) throw failure('invalid_timeline_result', 'The Timeline data is invalid.');
      if (boundedSignal.aborted && !signal.aborted) throw failure('timeline_timeout', 'Timeline processing exceeded its 20-minute window.');
      throw error;
    }
  } };
}
function failure(code: string, message: string) { return new GenerationExecutionError({ code, message, retryable: false }); }
