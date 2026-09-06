import assert from 'node:assert/strict';
import test from 'node:test';
import { createAudioPipelineHandlers } from './pipeline-audio-handlers';
import { createAudioResultId } from './pipeline-audio-artifacts';
import { isUuidV7 } from '@/shared/lib/id';
import { hasProviderCalls } from './runtime-cost-estimator';

const audio = { kind: 'audio' as const, assetId: 'audio' };
const handlers = createAudioPipelineHandlers({ convertAudio: async () => audio,
  generateAudio: async () => audio, transcribeAudio: async () => 'text', resolveAsset: async () => audio });
const input = { nodeId: 'node', config: {}, inputs: {}, signal: new AbortController().signal,
  context: { runId: 'run', workspaceId: 'workspace', pipelineId: 'pipeline', pipelineVersion: 1, sourceApplication: 'test' } };
test('audio handlers require one correctly typed input; Voice caps text before dispatch', async () => {
  for (const type of ['audio.convert', 'ai.audio.transcribe']) {
    const handler = handlers.find((h) => h.handlerType === type)!;
    await assert.rejects(handler.execute(input));
    await assert.rejects(handler.execute({ ...input, inputs: { source: { kind: 'image', assetId: 'image' } } }));
    await assert.rejects(handler.execute({ ...input, inputs: { source: audio, second: audio } }));
  }
  await assert.rejects(handlers.find((h) => h.handlerType === 'ai.audio.generate')!.execute({ ...input, inputs: { text: 'a'.repeat(5001) } }));
});
test('audio conversion IDs are stable and isolated by runtime run and content', () => {
  assert.ok(isUuidV7(createAudioResultId('run', 'node:file')));
  assert.equal(createAudioResultId('run', 'node:file'), createAudioResultId('run', 'node:file'));
  assert.notEqual(createAudioResultId('run', 'node:file'), createAudioResultId('other-run', 'node:file'));
});
test('both audio model operations participate in the existing paid-call cost gate', () => {
  for (const handlerType of ['ai.audio.generate', 'ai.audio.transcribe', 'audio.convert']) {
    assert.equal(hasProviderCalls({ executionLevels: [['n']], definition: {
      schemaVersion: 1, inputs: {}, outputs: {}, nodes: [{ id: 'n', handlerType, handlerVersion: '1', inputs: {}, config: {} }],
    } }), handlerType.startsWith('ai.'));
  }
});
