import type { VideoGenerationRequest, VideoSettings } from '@/shared/media/video-generation-contracts';
import type { BaseNodeData } from './node-data-image';

export interface GenerateVideoNodeData extends Omit<BaseNodeData, 'prompt'>, VideoSettings {
  referenceDescriptions: string[];
  resultAssetIds: string[];
  activeResultIndex: number;
  message?: string;
  videoRequest?: {
    jobId?: string; idempotencyKey: string; workspaceId: string; documentId: string;
    /** Frozen request permits safe retry even if the submit response was lost. */
    payload: VideoGenerationRequest;
  };
}
