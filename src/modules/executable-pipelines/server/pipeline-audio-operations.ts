import { persistAuthorizedAudioAsset } from '@/entities/asset/server/audio-asset-service';
import { convertAudioBytes, inspectAudioBytes } from '@/shared/media/audio-processor';
import { audioConvertOptionsSchema, MAX_AUDIO_OUTPUT_BYTES } from '@/shared/media/audio-contracts';
import { transcribeAudio } from '@/modules/generation/server/audio-transcription';
import { generateSpeech } from '@/modules/generation/server/speech-generation';
import { longSpeechOptionsSchema } from '@/modules/provider-connections/server/speech-provider-call';
import { getRuntimeGenerationAttribution } from './runtime-usage-attribution';
import { readAudioArtifact, toAudioArtifact, resolveStoredArtifact, createAudioResultId } from './pipeline-audio-artifacts';
import type { AudioHandlerDependencies } from './pipeline-audio-handlers';
import type { PipelineHandlerScope } from './pipeline-ai-handlers';
import { requireString } from './pipeline-handler-values';

export function createStoredAudioOperations(scope: PipelineHandlerScope): AudioHandlerDependencies {
  return {
    async convertAudio(input) {
      const source = await readAudioArtifact(input.context.workspaceId, input.artifact, input.signal);
      const options = audioConvertOptionsSchema.parse(input.config);
      const converted = await convertAudioBytes({ bytes: source.bytes, options, signal: input.signal });
      input.signal.throwIfAborted();
      const asset = await persistAuthorizedAudioAsset({
        bytes: converted.bytes, claimedContentType: converted.contentType, signal: input.signal,
        documentId: scope.documentId, libraryVisible: false, maxBytes: MAX_AUDIO_OUTPUT_BYTES,
        originalName: `converted.${converted.extension}`, origin: 'unknown', operation: 'audio_convert',
        requestedAssetId: createAudioResultId(input.context.runId, `${input.nodeId}:${source.asset.checksumSha256}:${JSON.stringify(options)}`),
        metadata: { pipelineRunId: input.context.runId, pipelineNodeId: input.nodeId, sourceAssetId: source.asset.id },
        userId: scope.actorUserId, workspaceId: input.context.workspaceId,
      }, converted);
      return toAudioArtifact(asset, input.context.runId);
    },
    async transcribeAudio(input) {
      const source = await readAudioArtifact(input.context.workspaceId, input.artifact, input.signal);
      return transcribeAudio({
        bytes: source.bytes, model: requireString(input.config.model, 'Transcription model'),
        language: typeof input.config.language === 'string' ? input.config.language : 'auto',
        actorUserId: scope.actorUserId, documentId: scope.documentId, workspaceId: input.context.workspaceId,
        idempotencyKey: `pipeline:${input.context.runId}:node:${input.nodeId}`, signal: input.signal,
        runtimeAttribution: await getRuntimeGenerationAttribution(input.context, input.nodeId),
        metadata: { pipelineRunId: input.context.runId, pipelineNodeId: input.nodeId, sourceAssetId: source.asset.id },
      });
    },
    async generateAudio(input) {
      const options = longSpeechOptionsSchema.parse({ ...input.config, inputText: input.text });
      const execution = await generateSpeech({
        options, signal: input.signal, actorUserId: scope.actorUserId,
        scope: {
          idempotencyKey: `pipeline:${input.context.runId}:node:${input.nodeId}`, documentId: scope.documentId,
          workspaceId: input.context.workspaceId,
          runtimeAttribution: await getRuntimeGenerationAttribution(input.context, input.nodeId),
          metadata: { pipelineRunId: input.context.runId, pipelineNodeId: input.nodeId },
        },
      });
      input.signal.throwIfAborted();
      const inspected = await inspectAudioBytes(execution.result.audioBody, { signal: input.signal });
      const asset = await persistAuthorizedAudioAsset({
        bytes: execution.result.audioBody, claimedContentType: execution.result.contentType, signal: input.signal,
        documentId: scope.documentId, libraryVisible: false, maxBytes: MAX_AUDIO_OUTPUT_BYTES,
        generationJobId: execution.job.id, modelId: options.model, provider: 'openrouter',
        originalName: execution.result.contentType === 'audio/wav' ? 'voice.wav' : 'voice.mp3',
        operation: 'generate_speech', origin: 'generated', userId: scope.actorUserId, workspaceId: input.context.workspaceId,
        metadata: { pipelineRunId: input.context.runId, pipelineNodeId: input.nodeId,
          speechChunkCount: execution.chunkCount, voice: options.voice, language: options.language },
      }, inspected);
      return toAudioArtifact(asset, input.context.runId);
    },
    async resolveAsset(input) {
      const kind = input.config.mediaKind;
      if (kind !== 'audio' && kind !== 'image') throw new Error('Import media kind is invalid.');
      return resolveStoredArtifact(scope.actorUserId, input.context.workspaceId, requireString(input.config.assetId, 'Import file'), kind);
    },
  };
}
