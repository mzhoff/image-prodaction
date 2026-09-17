import { AssetStorageError, type AssetDto } from '@/entities/asset/server/asset-service';
import { deriveWorkspaceVideoAsset } from '@/entities/asset/server/video-derivation-service';
import { getWorkspaceVideoAsset } from '@/entities/asset/server/video-asset-service';
import { VideoProcessingError } from '@/shared/media/video-contracts';
import { getVideoDisplayDimensions } from '@/shared/media/video-crop';
import { aspectRatioValue, fitCropToAspect, fitCropToOutputAspectPreservingOrigin, fullCrop } from '@/shared/media/crop-geometry';
import type { PipelineArtifactReference } from '../contracts/pipeline-contracts';
import { PipelineNodeHandlerError } from '../contracts/pipeline-errors';
import type { PipelineHandlerScope } from './pipeline-ai-handlers';
import { toAudioArtifact } from './pipeline-audio-artifacts';
import { requireString } from './pipeline-handler-values';
import type { VideoHandlerDependencies } from './pipeline-video-handlers';

export function createStoredVideoOperations(scope: PipelineHandlerScope, dependencies: {
  getSource?: typeof getWorkspaceVideoAsset;
  derive?: typeof deriveWorkspaceVideoAsset;
} = {}): VideoHandlerDependencies {
  return {
    async resolveVideo(input) {
      input.signal.throwIfAborted();
      const assetId = requireString(input.config.assetId, 'Import video');
      const asset = await (dependencies.getSource ?? getWorkspaceVideoAsset)({ assetId, workspaceId: input.context.workspaceId });
      if (asset.id !== assetId || asset.workspaceId !== input.context.workspaceId || asset.status !== 'ready' || asset.mediaKind !== 'video' || !asset.video) {
        throw new VideoProcessingError('invalid_video_asset', 'Import must reference a ready video in this workspace.');
      }
      return toVideoArtifact(asset, input.context.runId);
    },
    async deriveVideo(input) {
      try {
        input.signal.throwIfAborted();
        let crop = input.crop;
        if (input.kind === 'crop') {
          const source = await (dependencies.getSource ?? getWorkspaceVideoAsset)({ assetId: input.artifact.assetId, workspaceId: input.context.workspaceId });
          if (source.id !== input.artifact.assetId || source.workspaceId !== input.context.workspaceId || source.status !== 'ready'
            || source.mediaKind !== 'video' || !source.video || (input.artifact.checksumSha256 && input.artifact.checksumSha256 !== source.checksumSha256)) {
            throw new VideoProcessingError('invalid_video_asset', 'Crop source does not match the ready Workspace video.');
          }
          const { width, height } = getVideoDisplayDimensions(source.video);
          const ratio = aspectRatioValue(input.aspectRatio ?? 'Custom');
          crop = ratio ? crop ? fitCropToOutputAspectPreservingOrigin(crop, width / height, ratio)
            : fitCropToAspect(width, height, ratio) : crop ?? fullCrop();
        }
        const asset = await (dependencies.derive ?? deriveWorkspaceVideoAsset)({
          workspaceId: input.context.workspaceId, userId: scope.actorUserId,
          assetId: input.artifact.assetId, kind: input.kind, signal: input.signal,
          ...(input.kind === 'audio' && input.audioTrackIndex !== undefined ? { audioTrackIndex: input.audioTrackIndex } : {}),
          ...(input.kind === 'crop' ? { crop } : {}),
        });
        if (asset.workspaceId !== input.context.workspaceId || asset.status !== 'ready'
          || asset.mediaKind !== (input.kind === 'audio' ? 'audio' : 'video')) {
          throw new VideoProcessingError('invalid_video_result', 'Derived output must be a ready file of the requested kind in this workspace.');
        }
        if (input.kind === 'audio') return toAudioArtifact(asset, input.context.runId);
        return toVideoArtifact(asset, input.context.runId);
      } catch (error) {
        input.signal.throwIfAborted();
        const retryable = error instanceof AssetStorageError || (error instanceof VideoProcessingError
          && ['video_busy', 'video_derivation_busy'].includes(error.code));
        throw new PipelineNodeHandlerError({ nodeId: input.nodeId, retryable,
          message: retryable ? 'Video processing is temporarily busy or storage is unavailable.' : 'The requested video output could not be prepared.',
        });
      }
    },
  };
}

export function toVideoArtifact(asset: AssetDto, runId?: string): PipelineArtifactReference {
  if (asset.mediaKind !== 'video' || !asset.video) {
    throw new VideoProcessingError('invalid_video_asset', 'The stored video metadata is unavailable.');
  }
  return {
    kind: 'video', assetId: asset.id, mimeType: asset.contentType, sizeBytes: asset.byteSize,
    checksumSha256: asset.checksumSha256, width: asset.width, height: asset.height,
    durationSeconds: asset.video.durationSeconds, codec: asset.video.codec,
    hasAudio: asset.video.audioTracks.length > 0,
    ...(runId ? { contentUrl: `/v1/runs/${runId}/artifacts/${asset.id}` } : {}),
  };
}
