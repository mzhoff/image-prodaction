import type {
  PipelineNodeOutputs,
  PipelineRunStatus,
  PipelineValueContract,
} from './pipeline-contracts';
import type { SemanticContractSnapshot } from '@/shared/contracts/semantic-contract';

export interface PipelineRuntimeDescriptor {
  input: {
    fields: Record<string, PipelineValueContract>;
    schemaChecksum: string | null;
    semanticContract: SemanticContractSnapshot | null;
  };
  output: {
    fields: Record<string, PipelineValueContract>;
    schemaChecksum: string | null;
    semanticContract: SemanticContractSnapshot | null;
  };
  pipeline: {
    capabilityKey: string | null;
    checksum: string;
    publicId: string;
    version: number;
  };
}

export interface PipelineRuntimeRun {
  attemptCount: number;
  createdAt: string;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  } | null;
  finishedAt: string | null;
  id: string;
  idempotentReplay: boolean;
  maxAttempts: number;
  outputs: PipelineNodeOutputs | null;
  pipeline: {
    publicId: string;
    version: number;
  };
  startedAt: string | null;
  status: PipelineRunStatus;
  statusUrl: string;
}
