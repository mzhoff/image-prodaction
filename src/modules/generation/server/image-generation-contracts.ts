import type { GenerateLayerInputs, GenerateReferenceSlot } from '@/entities/production-graph/model/generate-prompt-builder';
import type { ProductionNodeType } from '@/entities/production-graph/model/types';
import type { ProviderResult } from '@/modules/provider-connections';
import type { ImageGenerationOptions } from '@/shared/media/image-generation-settings';

export interface QueuedGenerateImagePayload extends ImageGenerationOptions {
  aspectRatio: string;
  documentId: string | null;
  homeConversationId?: string;
  storyCharacter?: { storyId: string; characterId: string; revision: number };
  inputs: GenerateLayerInputs;
  locationInputs: string[];
  model: string;
  prompt: string;
  referenceImages: Array<{
    dataUrl: string;
    slots: GenerateReferenceSlot[];
    sourceAssetId?: string;
    sourceNodeTypes?: ProductionNodeType[];
  }>;
  size: string;
  subjectInputs: string[];
  workspaceId: string;
}

export interface ProviderResultCheckpoint {
  attemptCount: number;
  result: ProviderResult;
  version: 1;
}
