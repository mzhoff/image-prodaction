import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getOpenRouterSpeechCapabilities,
  getOpenRouterSpeechResponseFormat,
  getSafeSpeechResponseFormat,
  getSafeSpeechVoice,
} from './openrouter-speech-capabilities';

test('Gemini TTS only exposes PCM and coerces saved MP3 values before request', () => {
  const model = 'google/gemini-3.1-flash-tts-preview';
  const capabilities = getOpenRouterSpeechCapabilities(model);

  assert.deepEqual(capabilities.formats, ['pcm']);
  assert.equal(getSafeSpeechResponseFormat(model, 'mp3'), 'pcm');
  assert.equal(getOpenRouterSpeechResponseFormat(model, 'mp3'), 'pcm');
});

test('Grok TTS keeps selectable MP3 and PCM formats', () => {
  const model = 'x-ai/grok-voice-tts-1.0';
  const capabilities = getOpenRouterSpeechCapabilities(model);

  assert.deepEqual(capabilities.formats, ['mp3', 'pcm']);
  assert.equal(getOpenRouterSpeechResponseFormat(model, 'mp3'), 'mp3');
  assert.equal(getOpenRouterSpeechResponseFormat(model, 'pcm'), 'pcm');
});

test('MAI voice exposes the formats, controls, and official MAI-Voice-2 voices accepted by OpenRouter', () => {
  const capabilities = getOpenRouterSpeechCapabilities('microsoft/mai-voice-2');

  assert.deepEqual(capabilities.formats, ['mp3', 'pcm']);
  assert.equal(capabilities.supportsSpeed, true);
  assert.equal(capabilities.supportsResponseFormat, true);
  assert.equal(getOpenRouterSpeechResponseFormat('microsoft/mai-voice-2', 'mp3'), 'mp3');
  assert.equal(getOpenRouterSpeechResponseFormat('microsoft/mai-voice-2', 'pcm'), 'pcm');
  assert.ok(capabilities.voices.includes('en-US-Harper:MAI-Voice-2'));
  assert.ok(capabilities.voices.includes('ru-RU-Masha:MAI-Voice-2'));
});

test('safe MAI voice fallback follows selected language when saved voice is stale', () => {
  assert.equal(
    getSafeSpeechVoice('microsoft/mai-voice-2', 'ru-RU-SvetlanaNeural', 'ru'),
    'ru-RU-Masha:MAI-Voice-2',
  );
  assert.equal(
    getSafeSpeechVoice('microsoft/mai-voice-2', 'en-US-Ava:MAI-Voice-2', 'en'),
    'en-US-Harper:MAI-Voice-2',
  );
});
