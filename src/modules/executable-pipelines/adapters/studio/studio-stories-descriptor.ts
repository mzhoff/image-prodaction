import type { GraphEdge, ProductionNode, ReverieStoriesNodeData } from '@/entities/production-graph/model/types';
import { STORY_DOCUMENT_SCHEMA_CHECKSUM, STORIES_DOCUMENT_FORMAT } from '@/shared/contracts/stories-document';
import type { PipelineValue, PipelineValueContract } from '../../contracts/pipeline-contracts';

export function storiesOutputContract(required = true): PipelineValueContract {
  return { kind: 'json', required, documentFormat: STORIES_DOCUMENT_FORMAT, documentSchemaChecksum: STORY_DOCUMENT_SCHEMA_CHECKSUM };
}

export function getStoriesRuntimeDescriptor(node: ProductionNode, incomingEdges: readonly GraphEdge[] = []) {
  const data = node.data as ReverieStoriesNodeData;
  return { handlerType: 'stories.assemble', config: {
    storyMode: data.storyMode ?? 'slide',
    documentSchemaChecksum: STORY_DOCUMENT_SCHEMA_CHECKSUM,
    storyTitle: data.storyTitle ?? '', subtitle: data.subtitle ?? '', text: data.text ?? '',
    locale: data.locale ?? 'ru-RU', styleProfileId: data.styleProfileId ?? 'reverie-default',
    styleRevisionId: data.styleRevisionId ?? 'reverie-default-r1',
    // Local edits are a content draft. A new run follows its connected recipe.
    ...(data.document && data.storyMode !== 'sequence' && incomingEdges.length === 0
      ? { document: data.document as unknown as PipelineValue } : {}),
  } };
}
