import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import { syncGeneratePromptSections } from '@/entities/production-graph/model/sync-generate-prompt-sections';
import { buildGeneratePayload } from './generate-node-inputs';

test('Studio request sends each tagged block once and leaves Prompt disconnected', async () => {
  const source = createDefaultNode('textPrompt', { x: 0, y: 0 });
  source.data = { ...source.data, text: 'Opening\n[Actors]\nAlice\n[New Tag]\nClouds' };
  const target = createDefaultNode('generateImage', { x: 400, y: 0 });
  const state = syncGeneratePromptSections([source, target], [{
    id: 'prompt', sourceNodeId: source.id, sourcePortId: 'text', targetNodeId: target.id, targetPortId: 'prompt',
  }]);
  const payload = await buildGeneratePayload(target.id, state.edges, state.nodes, []);
  assert.deepEqual(payload.promptInputs, ['[Actors]\nAlice', '[New Tag]\nClouds']);
  assert.deepEqual(payload.referenceImages, []);
});
