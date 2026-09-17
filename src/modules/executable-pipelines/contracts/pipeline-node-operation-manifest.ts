import type { PipelineValueKind } from './pipeline-contracts';

export type PipelineNodeSideEffect = 'none' | 'provider-call' | 'storage-write';
export type PipelineNodeManifestValueKind = PipelineValueKind | 'any';

export interface PipelineNodeOperationManifest {
  config: 'required' | 'optional';
  deterministic: boolean;
  handlerType: string;
  handlerVersion: string;
  inputs: Record<string, PipelineNodeManifestValueKind | `${PipelineNodeManifestValueKind}?`>;
  /** Explicit collections accepted in place of a corresponding singular input. */
  inputCollections?: Record<string, 'image_collection' | 'text_collection'>;
  outputs: Record<string, PipelineNodeManifestValueKind>;
  paid: boolean;
  retry: 'never' | 'pipeline';
  sideEffect: PipelineNodeSideEffect;
  timeoutMs: number;
}
