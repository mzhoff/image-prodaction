import type { PipelineRunJob } from '../contracts/pipeline-contracts';

export interface PipelineConsumerRunIdentity {
  consumerId: string;
  pipelineId: string;
  sourceApplication: string;
}

export function canPipelineConsumerAccessRun(
  identity: PipelineConsumerRunIdentity,
  run: PipelineRunJob,
) {
  if (run.pipelineId !== identity.pipelineId) return false;
  if (run.consumerId) return run.consumerId === identity.consumerId;
  return run.sourceApplication === identity.sourceApplication;
}
