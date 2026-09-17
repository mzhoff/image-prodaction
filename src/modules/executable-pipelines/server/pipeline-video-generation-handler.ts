import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { getGenerationJob } from '@/entities/generation/server/generation-orchestrator';
import { getWorkspaceVideoAsset } from '@/entities/asset/server/video-asset-service';
import { cancelGenerationJob, submitGenerationJob } from '@/modules/generation/server/generation-submission-service';
import { validateVideoAssets, type QueuedVideoPayload } from '@/modules/generation/server/video-generation-input';
import { loadVideoCatalog } from '@/modules/provider-connections/adapters/openrouter-video-catalog';
import { expandVideoReferenceInputs } from '@/shared/media/video-reference-inputs';
import { validateVideoRequest, videoRequestSchema, videoSettingsSchema, VIDEO_REFERENCE_LIMIT } from '@/shared/media/video-generation-contracts';
import type { PipelineNodeHandler, PipelineNodeHandlerInput } from '../contracts/pipeline-contracts';
import { PipelineNodeHandlerError } from '../contracts/pipeline-errors';
import { isPipelineArtifactReference } from '../core/pipeline-executor';
import type { PipelineHandlerScope } from './pipeline-ai-handlers';
import { getRuntimeGenerationAttribution } from './runtime-usage-attribution';
import { toVideoArtifact } from './pipeline-video-operations';
import { RuntimeCostError } from '../core/runtime-cost-policy';

export function buildPipelineVideoRequest(input: Pick<PipelineNodeHandlerInput, 'inputs' | 'config' | 'nodeId'>) {
  const settings = videoSettingsSchema.parse(input.config);
  const image = (port: string) => {
    const entries = Object.entries(input.inputs).filter(([key]) => key === port || key.startsWith(`${port}.`));
    if (!entries.length) return undefined;
    const value = entries.length === 1 ? entries[0]![1] : undefined;
    const artifact = Array.isArray(value) && value.length === 1 ? value[0] : value;
    if (!artifact || !isPipelineArtifactReference(artifact, 'image')) throw new PipelineNodeHandlerError({ nodeId: input.nodeId, message: `Video ${port} requires exactly one image. Use references mode for a frame gallery.` });
    return { assetId: artifact.assetId, description: '' };
  };
  const prompts = Object.entries(input.inputs).filter(([key]) => key === 'prompt' || key.startsWith('prompt.'));
  if (prompts.some(([, value]) => typeof value !== 'string' || !value.trim())) throw new PipelineNodeHandlerError({ nodeId: input.nodeId, message: 'Video prompt input must contain text.' });
  const descriptions = Array.isArray(input.config.referenceDescriptions) ? input.config.referenceDescriptions : [];
  return videoRequestSchema.parse({ ...settings, prompt: [...prompts.map(([, value]) => value), settings.prompt].filter(Boolean).join('\n\n'),
    firstFrame: image('first-frame'), lastFrame: image('last-frame'),
    references: expandVideoReferenceInputs(Array.from({ length: VIDEO_REFERENCE_LIMIT }, (_, i) => {
      const port = `reference-${i + 1}`;
      const entries = Object.entries(input.inputs).filter(([key]) => key === port || key.startsWith(`${port}.`));
      if (!entries.length) return [];
      if (entries.length !== 1) throw new PipelineNodeHandlerError({ nodeId: input.nodeId, message: `Video ${port} requires exactly one image source or gallery.` });
      const value = entries[0]![1];
      const values = Array.isArray(value) ? value : [value];
      if (!values.length || values.some((entry) => !isPipelineArtifactReference(entry, 'image'))) {
        throw new PipelineNodeHandlerError({ nodeId: input.nodeId, message: `Video ${port} requires prepared image artifacts.` });
      }
      return [{ slot: i + 1, assetIds: values.map((entry) => (entry as { assetId: string }).assetId) }];
    }).flat(), descriptions.map((value) => typeof value === 'string' ? value : '')),
  });
}
export function createVideoGenerationHandler(scope: PipelineHandlerScope): PipelineNodeHandler {
  return { handlerType: 'ai.video.generate', handlerVersion: '1', async execute(input) {
    if (!scope.documentId) throw new PipelineNodeHandlerError({ nodeId: input.nodeId, message: 'Video generation requires a source document.' });
    const request = buildPipelineVideoRequest(input);
    const model = (await loadVideoCatalog()).find((model) => model.key === request.model);
    const validation = validateVideoRequest(request, model);
    if (validation) throw new PipelineNodeHandlerError({ nodeId: input.nodeId, message: validation });
    await validateVideoAssets(request, scope.actorUserId, input.context.workspaceId);
    input.signal.throwIfAborted();
    const payload: QueuedVideoPayload = { request, documentId: scope.documentId, workspaceId: input.context.workspaceId };
    let job = await submitGenerationJob({ userId: scope.actorUserId, ...payload, payload,
      operation: 'generate_video', provider: model!.route.gateway, modelId: model!.route.modelId, maxAttempts: 3,
      idempotencyKey: `pipeline:${input.context.runId}:node:${input.nodeId}`,
      runtimeAttribution: await getRuntimeGenerationAttribution(input.context, input.nodeId),
      metadata: { requestHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
        pipelineRunId: input.context.runId, pipelineNodeId: input.nodeId, modelKey: request.model, mode: request.mode },
    });
    try {
      const deadline = Date.now() + 50 * 60_000;
      while (Date.now() < deadline) {
        input.signal.throwIfAborted();
        if (job.status === 'succeeded' && job.finalAssetId) return { video: toVideoArtifact(await getWorkspaceVideoAsset({ assetId: job.finalAssetId, workspaceId: input.context.workspaceId }), input.context.runId) };
        if (job.status === 'canceled' || job.status === 'failed' && (!job.error?.retryable || job.attemptCount >= job.maxAttempts)) {
          const code = job.error?.code;
          if (code === 'cost_estimate_unavailable' || code === 'cost_limit_exceeded' || code === 'cost_enforcement_unsupported') throw new RuntimeCostError(code);
          throw new PipelineNodeHandlerError({ nodeId: input.nodeId, message: job.error?.message ?? 'Video generation failed.' });
        }
        await delay(2000, undefined, { signal: input.signal });
        job = await getGenerationJob(scope.actorUserId, job.id);
      }
      throw new PipelineNodeHandlerError({ nodeId: input.nodeId, message: 'Video is still processing. Retry checks the same durable job.', retryable: true });
    } catch (error) {
      // Match pipeline cancellation semantics; a transient lease loss must leave the child resumable.
      if (input.signal.aborted && input.signal.reason instanceof Error && input.signal.reason.message.includes('lease canceled')) {
        await cancelGenerationJob(scope.actorUserId, job.id).catch(() => undefined);
      }
      throw error;
    }
  } };
}
