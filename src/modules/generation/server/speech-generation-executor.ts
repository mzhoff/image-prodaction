import { getGeneratedAssetByJobId } from '@/entities/asset/server/asset-service';
import { createHash } from 'node:crypto';
import { persistAuthorizedAudioAsset } from '@/entities/asset/server/audio-asset-service';
import { AudioProcessingError, MAX_AUDIO_OUTPUT_BYTES } from '@/shared/media/audio-contracts';
import { inspectAudioBytes } from '@/shared/media/audio-processor';
import { MAX_SPEECH_EXECUTION_MILLISECONDS, SPEECH_CHUNKING_VERSION, splitSpeechText } from '@/shared/media/speech-text';
import { longSpeechOptionsSchema, type SpeechOptions } from '@/modules/provider-connections/server/speech-provider-call';
import { ProviderAdapterError } from '@/modules/provider-connections/core/provider-errors';
import { assertActiveGenerationAttempt, getGenerationExecutionRecord } from './generation-execution-repository';
import { createGenerationPayloadStore } from './generation-payload-store';
import { emptyUsage } from './generation-usage-recorder';
import { GenerationExecutionError, type GenerationExecutor } from './generation-worker-contracts';
import { ShortAiExecutionError } from './short-ai-execution-contracts';
import { generateSpeech } from './speech-generation';

export interface QueuedSpeechPayload { workspaceId: string; documentId: string; options: SpeechOptions }

export function createSpeechGenerationExecutor(dependencies = {
  assertActive: assertActiveGenerationAttempt,
  findAsset: getGeneratedAssetByJobId,
  getActor: async (jobId: string) => (await getGenerationExecutionRecord(jobId)).createdByUserId,
  readPayload: (key: string) => createGenerationPayloadStore().read<QueuedSpeechPayload>(key),
  generate: generateSpeech, inspect: inspectAudioBytes, persist: persistAuthorizedAudioAsset,
}): GenerationExecutor {
  return { async execute({ job, signal }) {
    if (job.operation !== 'generate_speech_long' || !job.requestObjectKey) throw new GenerationExecutionError({
      code: 'invalid_speech_job', message: 'The queued speech request is invalid.', retryable: false,
    });
    const assertActive = () => dependencies.assertActive(job.id, job.attemptCount, signal);
    await assertActive();
    const existing = await dependencies.findAsset(job.id);
    if (existing?.status === 'ready') {
      if (existing.mediaKind !== 'audio' || existing.workspaceId !== job.workspaceId) throw new GenerationExecutionError({ code: 'invalid_speech_asset', message: 'Saved speech does not match the job.', retryable: false });
      return { assetId: existing.id, usage: emptyUsage() };
    }
    const actorUserId = await dependencies.getActor(job.id);
    const payload = await dependencies.readPayload(job.requestObjectKey);
    if (payload.workspaceId !== job.workspaceId || payload.documentId !== job.documentId
      || createHash('sha256').update(JSON.stringify(payload)).digest('hex') !== job.metadata?.requestHash) throw new GenerationExecutionError({
      code: 'speech_scope_mismatch', message: 'The speech payload does not match the authorized project.', retryable: false,
    });
    const options = longSpeechOptionsSchema.parse(payload.options);
    if (options.model !== job.modelId || job.metadata?.speechChunkingVersion !== SPEECH_CHUNKING_VERSION
      || job.metadata?.speechChunkCount !== splitSpeechText(options.inputText).filter((part) => part.text.trim()).length) {
      throw new GenerationExecutionError({ code: 'speech_plan_mismatch', message: 'The saved speech plan cannot be resumed by this worker version.', retryable: false });
    }
    const startedAt = Date.parse(job.startedAt ?? '');
    if (!Number.isFinite(startedAt) || Date.now() - startedAt >= MAX_SPEECH_EXECUTION_MILLISECONDS) {
      throw new GenerationExecutionError({ code: 'speech_execution_timeout', message: 'Long speech exceeded its 45-minute processing window.', retryable: false });
    }
    const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, MAX_SPEECH_EXECUTION_MILLISECONDS - Math.max(0, Date.now() - startedAt)))]);
    try {
      const generated = await dependencies.generate({ actorUserId, options, signal: boundedSignal, assertActive,
        scope: { workspaceId: job.workspaceId, documentId: payload.documentId, idempotencyKey: `speech-job:${job.id}`,
          metadata: { speechParentJobId: job.id } },
      });
      const inspected = await dependencies.inspect(generated.result.audioBody, { signal: boundedSignal, maxBytes: MAX_AUDIO_OUTPUT_BYTES });
      boundedSignal.throwIfAborted();
      await assertActive();
      const asset = await dependencies.persist({
        bytes: generated.result.audioBody, claimedContentType: generated.result.contentType, signal: boundedSignal,
        documentId: payload.documentId, workspaceId: job.workspaceId, userId: actorUserId,
        generationJobId: job.id, originalName: 'voice.mp3', modelId: options.model, provider: 'openrouter',
        operation: 'generate_speech', origin: 'generated', libraryVisible: false, maxBytes: MAX_AUDIO_OUTPUT_BYTES,
        metadata: { speechChunkCount: generated.chunkCount, voice: options.voice, language: options.language },
      }, inspected);
      await assertActive();
      // Paid usage belongs to child generation jobs; do not emit/double-count it on this orchestration job.
      return { assetId: asset.id, usage: emptyUsage() };
    } catch (error) {
      if (error instanceof ShortAiExecutionError || error instanceof ProviderAdapterError) throw new GenerationExecutionError({ code: error.descriptor.code,
        message: error.descriptor.message, retryable: false });
      if (boundedSignal.aborted && !signal.aborted) throw new GenerationExecutionError({ code: 'speech_execution_timeout',
        message: 'Long speech exceeded its 45-minute processing window.', retryable: false });
      if (error instanceof AudioProcessingError) throw new GenerationExecutionError({ code: error.code, message: error.message,
        retryable: ['audio_busy', 'audio_processor_unavailable', 'audio_timeout'].includes(error.code) });
      throw error;
    }
  } };
}
