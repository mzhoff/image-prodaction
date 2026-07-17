import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ProviderAdapterError,
  createFakeProviderAdapter,
  type ProviderExecuteRequest,
} from '../index';

const credential = 'workspace-fake-key';
const request: ProviderExecuteRequest = {
  expectedOutputModalities: ['text', 'image', 'audio'],
  messages: [{
    parts: [{ modality: 'text', text: 'Contract test' }],
    role: 'user',
  }],
  modelId: 'fake/multimodal-model',
  operation: 'contract_test',
};

test('fake adapter implements the same execute and operation-status contract', async () => {
  const adapter = createFakeProviderAdapter({ acceptedCredential: credential });
  const result = await adapter.execute(request, { credential });
  const status = await adapter.getOperationStatus(result.providerOperationId ?? '', { credential });

  assert.deepEqual(result.outputs.map((output) => output.modality), ['text', 'image', 'audio']);
  assert.equal(result.usage.complete, true);
  assert.equal(status.state, 'succeeded');
  assert.equal(status.usage.totalTokens, 15);
  assert.deepEqual(adapter.executeRequests, [request]);
});

test('fake adapter rejects invalid credential with the normalized permanent taxonomy', async () => {
  const adapter = createFakeProviderAdapter({ acceptedCredential: credential });
  await assert.rejects(
    adapter.validateCredential({ credential: 'wrong-key' }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderAdapterError);
      assert.equal(error.descriptor.code, 'invalid_credential');
      assert.equal(error.descriptor.classification, 'permanent');
      return true;
    },
  );
});

test('fake adapter can exercise missing-modality reconciliation in consumer tests', async () => {
  const adapter = createFakeProviderAdapter({
    acceptedCredential: credential,
    omittedModalities: ['image'],
  });
  await assert.rejects(
    adapter.execute(request, { credential }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderAdapterError);
      assert.equal(error.descriptor.code, 'missing_modality');
      assert.equal(error.descriptor.classification, 'ambiguous');
      return true;
    },
  );
});
