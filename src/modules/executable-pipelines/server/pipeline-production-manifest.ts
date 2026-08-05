import type { PipelineNodeOperationManifest } from '../contracts/pipeline-node-operation-manifest';

export const PRODUCTION_PIPELINE_NODE_MANIFEST = [
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
    handlerType: 'ai.image.analyze',
    inputs: { image: 'image' },
    outputs: { text: 'text' },
    paid: true,
    sideEffect: 'provider-call',
    timeoutMs: 180_000,
  }),
  operation({
    handlerType: 'ai.image.generate',
    inputs: { '*': 'json?' },
    outputs: { image: 'image' },
    paid: true,
    sideEffect: 'storage-write',
    timeoutMs: 600_000,
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
