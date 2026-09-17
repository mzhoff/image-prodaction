import { normalizeExtractAnalysisPreset } from '@/entities/production-graph/model/extract-analysis-profiles';
import { getExtractSystemPrompt } from '@/entities/production-graph/model/extract-presets';
import type { ProviderResult } from '@/modules/provider-connections';
import { executeInternalOpenRouterChat } from '@/modules/generation';
import { getRuntimeGenerationAttribution } from './runtime-usage-attribution';
import type { PipelineImageAnalyzer, PipelineImageOperationScope } from './pipeline-image-contracts';
import { readPipelineImageDataUrl } from './pipeline-image-artifacts';
import { requireString } from './pipeline-handler-values';

export function createOpenRouterImageAnalyzer(
  scope: PipelineImageOperationScope,
): PipelineImageAnalyzer {
  return async (input) => {
    const imageDataUrl = await readPipelineImageDataUrl(
      scope.actorUserId,
      input.context.workspaceId,
      input.artifact,
    );
    const execution = await executeInternalOpenRouterChat({
      runtimeAttribution: await getRuntimeGenerationAttribution(input.context, input.nodeId),
      actorUserId: scope.actorUserId,
      documentId: scope.documentId,
      idempotencyKey: `pipeline:${input.context.runId}:node:${input.nodeId}`,
      metadata: {
        pipelineId: input.context.pipelineId,
        pipelineRunId: input.context.runId,
        pipelineNodeId: input.nodeId,
      },
      providerRequest: {
        modelId: requireString(input.config.model, 'Model'),
        operation: 'analyze_image',
        expectedOutputModalities: ['text'],
        messages: [
          {
            role: 'system',
            parts: [{
              modality: 'text',
              text: getExtractSystemPrompt(normalizeExtractAnalysisPreset(input.config.analysisPreset)),
            }],
          },
          {
            role: 'user',
            parts: [
              { modality: 'text', text: requireString(input.config.prompt, 'Analysis prompt') },
              { modality: 'image', url: imageDataUrl },
            ],
          },
        ],
        parameters: { maxOutputTokens: 3500, temperature: 0.2 },
      },
      signal: input.signal,
      transform: getProviderText,
      workspaceId: input.context.workspaceId,
    });
    return execution.result;
  };
}

function getProviderText(result: ProviderResult) {
  const output = result.outputs.find((candidate) => candidate.modality === 'text');
  if (!output || output.modality !== 'text' || !output.text.trim()) {
    throw new Error('Provider response does not contain text.');
  }
  return output.text.trim();
}
