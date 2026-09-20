import assert from 'node:assert/strict';
import test from 'node:test';
import { pipelineExecutionActor } from './pipeline-execution-actor';
test('interactive pipeline execution charges the trusted initiating member, never the publisher', () => {
  const record = { initiatorType: 'workspace-user', initiatorId: 'member', sourceApplication: 'image-production-playground' };
  assert.equal(pipelineExecutionActor(record, 'publisher'), 'member');
  assert.equal(pipelineExecutionActor({ ...record, initiatorType: 'runtime-session-test' }, 'publisher'), 'member');
  assert.throws(() => pipelineExecutionActor({ ...record, initiatorId: null }, 'publisher'), /Автор запуска/);
  assert.throws(() => pipelineExecutionActor({ ...record, initiatorType: 'service', initiatorId: null }, 'publisher'), /Автор запуска/);
  assert.equal(pipelineExecutionActor({ ...record, sourceApplication: 'external-service', initiatorType: 'runtime-client', initiatorId: 'not-a-user' }, 'publisher'), 'publisher');
});
