import { videoCropSchema } from '@/shared/media/video-contracts';
import { cropAspectRatioOptions } from '@/shared/media/crop-geometry';
import type { PipelineNodeHandler } from '../contracts/pipeline-contracts';
import { PipelineNodeHandlerError } from '../contracts/pipeline-errors';
import { isPipelineArtifactReference } from '../core/pipeline-executor';
import type { VideoHandlerDependencies } from './pipeline-video-handler-contracts';

export function createVideoCropPipelineHandler(dependencies: Pick<VideoHandlerDependencies, 'deriveVideo'>): PipelineNodeHandler {
  return { handlerType: 'video.crop', handlerVersion: '1', async execute(input) {
    const artifact = input.inputs.video;
    const crop = videoCropSchema.optional().safeParse(input.config.crop);
    const aspectRatio = input.config.aspectRatio;
    if (Object.keys(input.inputs).length !== 1 || !isPipelineArtifactReference(artifact, 'video')
      || Object.keys(input.config).some((key) => !['crop', 'aspectRatio'].includes(key)) || !crop.success
      || typeof aspectRatio !== 'string' || !cropAspectRatioOptions.includes(aspectRatio)) {
      throw new PipelineNodeHandlerError({ nodeId: input.nodeId,
        message: 'Video Crop requires one video artifact and a valid normalized crop rectangle.' });
    }
    input.signal.throwIfAborted();
    const result = await dependencies.deriveVideo({ ...input, artifact, kind: 'crop', crop: crop.data, aspectRatio });
    input.signal.throwIfAborted();
    if (!isPipelineArtifactReference(result, 'video')) {
      throw new PipelineNodeHandlerError({ nodeId: input.nodeId, message: 'Video Crop did not produce a valid video artifact.' });
    }
    return { videoResult: result };
  } };
}
