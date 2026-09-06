import type { PipelineArtifactReference, PipelineNodeHandler, PipelineNodeHandlerInput } from '../contracts/pipeline-contracts';
import { PipelineNodeHandlerError } from '../contracts/pipeline-errors';
import { isPipelineArtifactReference } from '../core/pipeline-executor';

export type AudioOperationInput = Omit<PipelineNodeHandlerInput, 'inputs'> & { artifact: PipelineArtifactReference };
export interface AudioHandlerDependencies {
  convertAudio(input: AudioOperationInput): Promise<PipelineArtifactReference>;
  transcribeAudio(input: AudioOperationInput): Promise<string>;
  generateAudio(input: Omit<PipelineNodeHandlerInput, 'inputs'> & { text: string }): Promise<PipelineArtifactReference>;
  resolveAsset(input: PipelineNodeHandlerInput): Promise<PipelineArtifactReference>;
}

export function createAudioPipelineHandlers(dependencies: AudioHandlerDependencies): PipelineNodeHandler[] {
  return [
    { handlerType: 'audio.convert', handlerVersion: '1', async execute(input) {
      return { audio: await dependencies.convertAudio({ ...input, artifact: requireAudio(input) }) };
    } },
    { handlerType: 'ai.audio.transcribe', handlerVersion: '1', async execute(input) {
      return { text: await dependencies.transcribeAudio({ ...input, artifact: requireAudio(input) }) };
    } },
    { handlerType: 'ai.audio.generate', handlerVersion: '1', async execute(input) {
      const connected = Object.values(input.inputs).filter((value): value is string => typeof value === 'string').join('\n\n').trim();
      const text = connected || (typeof input.config.inputText === 'string' ? input.config.inputText.trim() : '');
      if (!text || text.length > 5000) throw new PipelineNodeHandlerError({ nodeId: input.nodeId, message: 'Voice requires 1–5000 characters.' });
      return { audio: await dependencies.generateAudio({ ...input, text }) };
    } },
    { handlerType: 'asset.reference', handlerVersion: '1', async execute(input) {
      return { asset: await dependencies.resolveAsset(input) };
    } },
  ];
}

function requireAudio(input: PipelineNodeHandlerInput) {
  const artifacts = Object.values(input.inputs).filter((value) => isPipelineArtifactReference(value, 'audio'));
  if (artifacts.length !== 1 || Object.keys(input.inputs).length !== 1) {
    throw new PipelineNodeHandlerError({ nodeId: input.nodeId, message: 'Connect exactly one audio file.' });
  }
  input.signal.throwIfAborted();
  return artifacts[0]! as PipelineArtifactReference;
}
