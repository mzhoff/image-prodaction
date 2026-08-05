import type { PipelineValueKind } from './pipeline-contracts';

export type PipelineNodeSideEffect = 'none' | 'provider-call' | 'storage-write';

export interface PipelineNodeOperationManifest {
  config: 'required' | 'optional';
  deterministic: boolean;
  handlerType: string;
  handlerVersion: string;
  inputs: Record<string, PipelineValueKind | `${PipelineValueKind}?`>;
  outputs: Record<string, PipelineValueKind>;
  paid: boolean;
  retry: 'never' | 'pipeline';
  sideEffect: PipelineNodeSideEffect;
  timeoutMs: number;
}
