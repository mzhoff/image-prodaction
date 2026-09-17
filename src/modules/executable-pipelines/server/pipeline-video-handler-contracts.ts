import type { VideoCrop } from '@/shared/media/video-contracts';
import type { PipelineArtifactReference, PipelineNodeHandlerInput } from '../contracts/pipeline-contracts';

export interface VideoHandlerDependencies {
  resolveVideo(input: PipelineNodeHandlerInput): Promise<PipelineArtifactReference>;
  deriveVideo(input: PipelineNodeHandlerInput & {
    artifact: PipelineArtifactReference;
    kind: 'audio' | 'video-only' | 'crop';
    audioTrackIndex?: number;
    crop?: VideoCrop;
    aspectRatio?: string;
  }): Promise<PipelineArtifactReference>;
}
