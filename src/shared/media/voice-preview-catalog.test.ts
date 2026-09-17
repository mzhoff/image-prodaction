import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import { getConfiguredSpeechModels, getOpenRouterSpeechCapabilities } from '../api/openrouter-speech-capabilities';
import { getVoiceAuditions, getVoiceProfile, parseVoicePreviewManifest } from './voice-preview-catalog';

test('every configured voice has a distinct model/voice audition and a short recording script', () => {
  const auditions = getVoiceAuditions();
  assert.equal(auditions.length, 35);
  assert.equal(new Set(auditions.map((item) => `${item.model}:${item.voice}`)).size, auditions.length);
  for (const model of getConfiguredSpeechModels()) {
    assert.deepEqual(auditions.filter((item) => item.model === model).map((item) => item.voice), getOpenRouterSpeechCapabilities(model).voices);
  }
  for (const audition of auditions) {
    assert.ok(audition.script.includes(audition.spokenName));
    assert.ok(audition.recordingText.length > 30 && audition.recordingText.length < 400);
    assert.ok(!audition.recordingText.includes('===VOICE==='));
  }
});

test('gender is source-backed, unknown/default voices do not borrow another model identity', () => {
  assert.equal(getVoiceProfile('google/gemini-3.1-flash-tts-preview', 'Kore').gender, 'female');
  assert.equal(getVoiceProfile('google/gemini-3.1-flash-tts-preview', 'Puck').gender, 'male');
  assert.equal(getVoiceProfile('hexgrad/kokoro-82m', 'bm_george').gender, 'male');
  assert.equal(getVoiceProfile('new-model', 'Kore').gender, 'unknown');
  assert.equal(getVoiceProfile('sesame/csm-1b', 'default').gender, 'unknown');
  assert.notEqual(getVoiceProfile('x-ai/grok-voice-tts-1.0', 'Leo').script, getVoiceProfile('canopylabs/orpheus-3b-0.1-ft', 'leo').script);
  assert.equal(getVoiceProfile('hexgrad/kokoro-82m', 'bf_emma').recordingLanguage, 'en');
});

test('preview manifest accepts only bundled media, unique exact model/voice/language keys', () => {
  const sample = { model: 'gemini', voice: 'Kore', language: 'ru', src: '/voice-previews/gemini/kore-ru-v1.mp3' };
  const unsafe = ['https://example.org/private.mp3', '/api/ai/generate-speech', '/api/assets/private', '/voice-previews/../private.mp3', '/voice-previews/%2e%2e/private.mp3'];
  assert.deepEqual(parseVoicePreviewManifest({ version: 1, samples: [sample, sample, ...unsafe.map((src) => ({ ...sample, src }))] }), [sample]);
  assert.deepEqual(parseVoicePreviewManifest({ version: 2, samples: [sample] }), []);
  assert.deepEqual(parseVoicePreviewManifest(null), []);
});

test('published preview manifest never advertises a missing audio file', async () => {
  const manifest = JSON.parse(await readFile('public/voice-previews/manifest.json', 'utf8'));
  const samples = parseVoicePreviewManifest(manifest);
  assert.equal(samples.length, manifest.samples.length);
  for (const sample of samples) await access(`public${sample.src}`);
});

test('recording handoff stays synchronized with the live voice catalogue', async () => {
  assert.deepEqual(JSON.parse(await readFile('docs/voice-auditions.json', 'utf8')), getVoiceAuditions());
});
