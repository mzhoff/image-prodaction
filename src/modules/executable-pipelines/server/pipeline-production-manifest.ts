import type { PipelineNodeOperationManifest } from '../contracts/pipeline-node-operation-manifest';

export const PRODUCTION_PIPELINE_NODE_MANIFEST = [
  operation({ handlerType: 'stories.assemble',
    inputs: { title: 'text?', subtitle: 'text?', text: 'text?', image: 'image?', video: 'video?', poster: 'image?', poll: 'json?', document: 'json?', 'document-*': 'json?' },
    outputs: { story: 'json' }, deterministic: true }),
  operation({ handlerType: 'ai.video.generate',
    inputs: { prompt: 'text?', 'first-frame': 'image?', 'last-frame': 'image?', 'reference-1': 'image?', 'reference-2': 'image?', 'reference-3': 'image?' },
    inputCollections: { 'first-frame': 'image_collection', 'last-frame': 'image_collection', 'reference-1': 'image_collection', 'reference-2': 'image_collection', 'reference-3': 'image_collection' },
    outputs: { video: 'video' }, paid: true, sideEffect: 'storage-write', timeoutMs: 3_000_000 }),
  operation({ handlerType: 'timeline.handoff', inputs: { video: 'video' }, outputs: { timeline: 'json', frames: 'image_collection', descriptions: 'text', videoResult: 'video' }, deterministic: true }),
  operation({ handlerType: 'asset.reference', inputs: {}, outputs: { asset: 'any' }, deterministic: true }),
  operation({ handlerType: 'video.import', inputs: {}, outputs: { original: 'video', video: 'video', audio: 'audio' },
    deterministic: true, sideEffect: 'storage-write', timeoutMs: 600_000 }),
  operation({ handlerType: 'video.crop', inputs: { video: 'video' }, outputs: { videoResult: 'video' },
    deterministic: true, sideEffect: 'storage-write', timeoutMs: 600_000 }),
  operation({ handlerType: 'audio.convert', inputs: { source: 'audio' }, outputs: { audio: 'audio' },
    deterministic: true, sideEffect: 'storage-write', timeoutMs: 180_000 }),
  operation({ handlerType: 'ai.audio.transcribe', inputs: { audio: 'audio' }, outputs: { text: 'text' },
    paid: true, sideEffect: 'provider-call', timeoutMs: 1_800_000 }),
  operation({ handlerType: 'ai.audio.generate', inputs: { text: 'text?' }, outputs: { audio: 'audio' },
    paid: true, sideEffect: 'storage-write', timeoutMs: 240_000 }),
  operation({
    handlerType: 'text.template.render',
    inputs: { '*': 'text?' },
    outputs: { text: 'text' },
    deterministic: true,
  }),
  operation({
    handlerType: 'text.concat',
    inputs: { '*': 'text' },
    outputs: { text: 'text' },
    deterministic: true,
  }),
  operation({
    handlerType: 'text.split',
    inputs: { text: 'text' },
    outputs: { items: 'text_collection', 'item-*': 'text' },
    deterministic: true,
  }),
  operation({
    handlerType: 'text.format',
    inputs: { text: 'text?' },
    outputs: { text: 'text' },
    deterministic: true,
  }),
  operation({
    handlerType: 'ai.text.generate',
    inputs: { text: 'text?' },
    outputs: { text: 'text' },
    paid: true,
    sideEffect: 'provider-call',
    timeoutMs: 180_000,
  }),
  operation({
    handlerType: 'ai.structured.generate',
    inputs: { source: 'any?' },
    outputs: { json: 'json', 'field-*': 'any' },
    paid: true,
    sideEffect: 'provider-call',
    timeoutMs: 180_000,
  }),
  operation({
    handlerType: 'ai.image.analyze',
    inputs: { image: 'image' },
    outputs: { text: 'text' },
    paid: true,
    sideEffect: 'provider-call',
    timeoutMs: 180_000,
  }),
  operation({
    handlerType: 'ai.image.generate',
    inputs: { '*': 'any?' },
    outputs: { image: 'image' },
    paid: true,
    sideEffect: 'storage-write',
    timeoutMs: 600_000,
  }),
  operation({
    handlerType: 'image.qr.generate',
    inputs: { text: 'text?' },
    outputs: { image: 'image' },
    deterministic: true,
    sideEffect: 'storage-write',
    timeoutMs: 30_000,
  }),
  operation({
    handlerType: 'image.export',
    inputs: { '*': 'image' },
    outputs: { image: 'image', images: 'image_collection' },
    deterministic: true,
    sideEffect: 'storage-write',
    timeoutMs: 180_000,
  }),
] as const satisfies readonly PipelineNodeOperationManifest[];

export function isProductionPipelineHandlerSupported(
  handlerType: string,
  handlerVersion: string,
) {
  return PRODUCTION_PIPELINE_NODE_MANIFEST.some((entry) => (
    entry.handlerType === handlerType && entry.handlerVersion === handlerVersion
  ));
}

function operation(input: Partial<PipelineNodeOperationManifest> & Pick<
  PipelineNodeOperationManifest,
  'handlerType' | 'inputs' | 'outputs'
>): PipelineNodeOperationManifest {
  return {
    config: 'optional',
    deterministic: false,
    handlerVersion: '1',
    paid: false,
    retry: 'pipeline',
    sideEffect: 'none',
    timeoutMs: 30_000,
    ...input,
  };
}
