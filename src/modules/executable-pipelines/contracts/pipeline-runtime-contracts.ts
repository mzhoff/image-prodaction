import type {
  PipelineNodeOutputs,
  PipelineRunStatus,
} from './pipeline-contracts';

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
