import assert from 'node:assert/strict';
import test from 'node:test';
import {
  recoverExpiredShortAiJobs,
  type ShortAiRecoveryDependencies,
} from './short-ai-recovery';

test('expired short AI recovery promotes checkpoints and closes unknown outcomes', async () => {
  const recoveredIds: string[] = [];
  const now = new Date('2026-07-17T12:00:00.000Z');
  const dependencies: ShortAiRecoveryDependencies = {
    async loadCandidates() {
      return [{
        attemptCount: 1,
        id: 'checkpointed',
        providerDispatchedAt: new Date('2026-07-17T11:55:00.000Z'),
        resultObjectKey: 'generation/workspace/job/result-attempt-1.json',
      }, {
        attemptCount: 1,
        id: 'unknown',
        providerDispatchedAt: new Date('2026-07-17T11:55:00.000Z'),
        resultObjectKey: null,
      }, {
        attemptCount: 1,
        id: 'raced',
        providerDispatchedAt: null,
        resultObjectKey: null,
      }];
    },
    async recoverCandidate(candidate) {
      recoveredIds.push(candidate.id);
      return candidate.id !== 'raced';
    },
  };

  const result = await recoverExpiredShortAiJobs({ now }, dependencies);

  assert.deepEqual(recoveredIds, ['checkpointed', 'unknown', 'raced']);
  assert.deepEqual(result, {
    scanned: 3,
    succeeded: 1,
    failed: 1,
  });
});
