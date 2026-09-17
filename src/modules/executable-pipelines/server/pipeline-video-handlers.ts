import type { PipelineArtifactReference, PipelineNodeHandler, PipelineNodeOutputs } from '../contracts/pipeline-contracts';
import { PipelineNodeHandlerError } from '../contracts/pipeline-errors';
import { isPipelineArtifactReference } from '../core/pipeline-executor';
import { createVideoCropPipelineHandler } from './pipeline-video-crop-handler';
import type { VideoHandlerDependencies } from './pipeline-video-handler-contracts';
export type { VideoHandlerDependencies } from './pipeline-video-handler-contracts';

/** Uploaded Import remains a pinned source, never an arbitrary remote URL. */
export function createVideoPipelineHandlers(dependencies: VideoHandlerDependencies): PipelineNodeHandler[] {
  return [{ handlerType: 'video.import', handlerVersion: '1', async execute(input) {
    const ports = input.config.outputPorts;
    const trackIndex = input.config.audioTrackIndex;
    if (Object.keys(input.inputs).length || !Array.isArray(ports)
      || ports.length > 3 || ports.some((port) => typeof port !== 'string' || !['original', 'video', 'audio'].includes(port))
      || (trackIndex !== undefined && (typeof trackIndex !== 'number' || !Number.isInteger(trackIndex) || trackIndex < 0 || trackIndex > 31))) {
      throw new PipelineNodeHandlerError({ nodeId: input.nodeId, message: 'Video Import has invalid outputs or audio track selection.' });
    }
    input.signal.throwIfAborted();
    const original = await dependencies.resolveVideo(input);
    requireKind(original, 'video', input.nodeId);
    const outputs: PipelineNodeOutputs = {};
    if (ports.includes('original')) outputs.original = original;
    if (ports.includes('video')) {
      input.signal.throwIfAborted();
      const video = await dependencies.deriveVideo({ ...input, artifact: original, kind: 'video-only' });
      requireKind(video, 'video', input.nodeId);
      outputs.video = video;
    }
    if (ports.includes('audio')) {
      input.signal.throwIfAborted();
      const audio = await dependencies.deriveVideo({ ...input, artifact: original, kind: 'audio',
        ...(typeof trackIndex === 'number' ? { audioTrackIndex: trackIndex } : {}),
      });
      requireKind(audio, 'audio', input.nodeId);
      outputs.audio = audio;
    }
    input.signal.throwIfAborted();
    return outputs;
  } }, createVideoCropPipelineHandler(dependencies)];
}

function requireKind(value: PipelineArtifactReference, kind: 'audio' | 'video', nodeId: string) {
  if (!isPipelineArtifactReference(value, kind)) {
    throw new PipelineNodeHandlerError({ nodeId, message: `Video Import did not produce a valid ${kind} artifact.` });
  }
}
