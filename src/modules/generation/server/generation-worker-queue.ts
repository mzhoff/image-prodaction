import {
  GenerationJobTransitionError,
  claimNextGenerationJob,
  failGenerationJob,
  heartbeatGenerationJob,
  succeedGenerationJob,
} from '@/entities/generation/server/generation-orchestrator';
import type { GenerationWorkerQueue } from './generation-worker-contracts';

export function createGenerationWorkerQueue(): GenerationWorkerQueue {
  return {
    claimNext: (input) => claimNextGenerationJob(input),
    async fail(input) {
      try {
        await failGenerationJob(input);
        return true;
      } catch (error) {
        if (error instanceof GenerationJobTransitionError) return false;
        throw error;
      }
    },
    async heartbeat(input) {
      return Boolean(await heartbeatGenerationJob(input));
    },
    async succeed(input) {
      try {
        await succeedGenerationJob(input);
        return true;
      } catch (error) {
        if (error instanceof GenerationJobTransitionError) return false;
        throw error;
      }
    },
  };
}
