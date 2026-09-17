import assert from 'node:assert/strict';
import test from 'node:test';
import { transcriptionLanguageOptions, transcriptionModelOptions } from './audio-node-options';

test('transcription model labels are human-readable without changing stored IDs', () => {
  assert.deepEqual(transcriptionModelOptions('google/gemini-3.1-flash-lite'), [
    { value: 'google/gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
  ]);
  assert.deepEqual(transcriptionModelOptions('provider/custom-audio-model'), [
    { value: 'provider/custom-audio-model', label: 'Custom Audio Model' },
  ]);
  assert.deepEqual(transcriptionLanguageOptions.map(({ value }) => value), ['auto', 'ru', 'en']);
  assert.equal(transcriptionLanguageOptions[0].label, 'Auto');
});
