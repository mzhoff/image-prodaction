import type { TimelineAnalysis } from '@/shared/media/timeline-contracts';
import type { TimelineOutputScope } from '@/shared/media/timeline-output';
import type { BaseNodeData } from './node-data-image';

export interface TimelineHandoffNodeData extends BaseNodeData {
  model: string;
  /** Omitted means the application language, not the spoken language of the video. */
  language?: string;
  threshold: number;
  analysis?: TimelineAnalysis;
  activeShotIndex: number;
  previewMode: 'video' | 'image';
  outputScope?: TimelineOutputScope;
  videoResultAssetId?: string;
  videoResultSignature?: string;
  message?: string;
  request?: {
    jobId?: string;
    idempotencyKey: string;
    fingerprint: string;
    action: 'analyze' | 'describe';
    sourceAssetId: string;
    workspaceId: string;
    documentId: string;
    shotBaselines?: Array<{ id: string; description: string; fingerprint: string }>;
  };
}
