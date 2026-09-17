import { finalizeProductionStoryDraft, storyDocumentAssets } from '@/shared/contracts/stories-document';
import type { CompiledPipelinePlan } from '../contracts/pipeline-contracts';
import { PipelineDomainError } from '../contracts/pipeline-errors';
import { createStoriesHandler } from './pipeline-stories-handler';
import { readStoryAssets, type StoryAssetReader } from './pipeline-stories-assets';

/** Before the publication checksum, validate authored media and retain its exact pins. */
export async function pinStoriesPublicationAssets(plan: CompiledPipelinePlan, workspaceId: string, read: StoryAssetReader = readStoryAssets) {
  const pinned = structuredClone(plan);
  for (const node of pinned.definition.nodes) {
    if (node.handlerType !== 'stories.assemble' || node.config.document === undefined) continue;
    try {
      const document = finalizeProductionStoryDraft(node.config.document);
      await createStoriesHandler(read).execute({ nodeId: node.id, config: node.config, inputs: {},
        signal: new AbortController().signal,
        context: { workspaceId, runId: 'publication-validation', pipelineId: 'publication-validation', pipelineVersion: 1, sourceApplication: 'studio' } });
      node.config.assetChecksums = Object.fromEntries(storyDocumentAssets(document).map((asset) => [asset.assetId,
        asset.source.kind === 'productionArtifact' ? asset.source.checksum.slice('sha256:'.length) : '']));
    } catch (error) {
      throw new PipelineDomainError({ code: 'pipeline_definition_invalid', message: error instanceof Error ? error.message : 'Проверьте Stories перед публикацией.' });
    }
  }
  return pinned;
}
