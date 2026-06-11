import assert from 'node:assert/strict';
import test from 'node:test';
import { createCatalogFromOpenRouter } from './openrouter-models';

test('createCatalogFromOpenRouter excludes speech models that currently fail OpenRouter speech endpoint', () => {
  const catalog = createCatalogFromOpenRouter([], [
    createSpeechModel('x-ai/grok-voice-tts-1.0'),
    createSpeechModel('mistralai/voxtral-mini-tts-2603'),
    createSpeechModel('zyphra/zonos-v0.1-transformer'),
    createSpeechModel('zyphra/zonos-v0.1-hybrid'),
  ]);

  assert.deepEqual(catalog.speechModels.map((model) => model.id), ['x-ai/grok-voice-tts-1.0']);
});

function createSpeechModel(id: string) {
  return {
    id,
    name: id,
    architecture: {
      input_modalities: ['text'],
      output_modalities: ['speech'],
    },
    supported_parameters: ['response_format'],
  };
}
