import type {
  PipelineInputs,
  PipelineValueKind,
  PipelineValueContract,
} from './pipeline-contracts';
import type { PipelineRuntimeRun } from './pipeline-runtime-contracts';

export interface PipelinePlaygroundField extends Pick<PipelineValueContract, 'schema' | 'defaultValue' | 'documentFormat' | 'documentSchemaChecksum'> {
  description: string | null;
  kind: PipelineValueKind;
  label: string;
  name: string;
  required: boolean;
}

export interface PipelinePlaygroundOutput {
  kind: PipelineValueKind;
  label: string;
  name: string;
}

export interface PipelinePlaygroundDescriptor {
  endpointPath: string;
  inputs: PipelinePlaygroundField[];
  name: string;
  outputs: PipelinePlaygroundOutput[];
  publicId: string;
  version: number;
  workspaceId: string;
}

export interface PipelinePlaygroundRun extends PipelineRuntimeRun {
  usage: {
    actualCostUsd: string | null;
    totalTokens: string | null;
  } | null;
}

export interface CreatePipelinePlaygroundRunInput {
  idempotencyKey: string;
  input: PipelineInputs;
  publicId: string;
}
