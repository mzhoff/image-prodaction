import type { GenerateLayerInputs, GenerateReferenceSlot } from '@/entities/production-graph/model/generate-prompt-builder';
import type { ProductionNodeType } from '@/entities/production-graph/model/types';
import type { ProviderResult } from '@/modules/provider-connections';

export interface QueuedGenerateImagePayload {
  aspectRatio: string;
  documentId: string;
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
