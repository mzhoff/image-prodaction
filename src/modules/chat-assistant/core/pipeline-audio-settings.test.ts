import assert from 'node:assert/strict';
import test from 'node:test';
import { initialProject } from '@/entities/production-graph/model/initial-project';
import { applyPipelineBuildPatch, parsePipelineBuildInput, preparePipelineBuild } from './pipeline-build';
import { sanitizePipelineNodeSettings } from './pipeline-node-settings';
import { MAX_SPEECH_TEXT_CHARACTERS } from '@/shared/media/speech-text';
import { createPipelineSettingsSchema } from '../contracts/pipeline-node-tool-schema';
import { pipelineContractFieldsSchema } from './pipeline-contract-field-schema';

test('audio settings stay typed and image/audio formats cannot cross node boundaries', () => {
  const warnings: string[] = [];
  assert.deepEqual(sanitizePipelineNodeSettings('audioConvert', {
    format: 'ogg', bitrateKbps: 128, sampleRateHz: 48000, channels: 1,
    audioAssetId: 'must-not-be-authored', sourceAudioAssetId: 'must-not-be-authored',
  }, 'convert', warnings), { format: 'ogg', bitrateKbps: 128, sampleRateHz: 48000, channels: 1 });
  assert.equal(warnings.length, 2);
  assert.deepEqual(sanitizePipelineNodeSettings('exportImage', { format: 'mp3' }), {});
  assert.deepEqual(sanitizePipelineNodeSettings('audioConvert', { format: 'png', bitrateKbps: 999, sampleRateHz: 123, channels: 6 }), {});
  assert.deepEqual(sanitizePipelineNodeSettings('exportImage', { format: 'webp' }), { format: 'webp' });
  const opusWarnings: string[] = [];
  assert.deepEqual(sanitizePipelineNodeSettings('audioConvert', { format: 'ogg', sampleRateHz: 44100 }, 'opus', opusWarnings), { format: 'ogg' });
  assert.equal(opusWarnings.length, 1);
  assert.match(opusWarnings[0]!, /44\.1 kHz/);
});

test('Voice and transcription expose bounded configuration but never job or file ownership', () => {
  assert.deepEqual(sanitizePipelineNodeSettings('speechToText', {
    model: 'google/gemini-3.1-flash-lite', language: 'auto',
    result: 'invented result', audioAssetId: 'foreign-id', lastRequest: { idempotencyKey: 'forged' },
  }), { model: 'google/gemini-3.1-flash-lite', language: 'auto' });
  assert.deepEqual(sanitizePipelineNodeSettings('textToSpeech', {
    localText: 'Привет!', language: 'ru', voice: 'Eve', responseFormat: 'mp3', speed: 1,
  }), { localText: 'Привет!', language: 'ru', voice: 'Eve', responseFormat: 'mp3', speed: 1 });
  assert.deepEqual(sanitizePipelineNodeSettings('textToSpeech', { speed: 9, language: 'invented', responseFormat: 'flac' }), {});
  assert.deepEqual(sanitizePipelineNodeSettings('importImage', { mediaKind: 'audio', assetId: 'foreign-id' }), {});
});

test('assistant prepares an audio Input -> transcription -> Voice -> convert -> Output proposal without running it', () => {
  const prepared = preparePipelineBuild(parsePipelineBuildInput({
    documentName: 'Audio transcription and voice',
    summary: 'Prepare an externally supplied recording for transcription and voice conversion.',
    nodes: [
      { key: 'input', type: 'pipelineInput', settings: { fields: [{ id: 'recording', key: 'recording', kind: 'audio', required: true }] } },
      { key: 'transcribe', type: 'speechToText', settings: { language: 'auto' } },
      { key: 'voice', type: 'textToSpeech', settings: { language: 'ru' } },
      { key: 'convert', type: 'audioConvert', settings: { format: 'ogg', bitrateKbps: 128 } },
      { key: 'output', type: 'pipelineOutput', settings: { fields: [{ id: 'recording', key: 'recording', kind: 'audio', required: true }] } },
    ],
    edges: [
      { sourceNodeKey: 'input', sourcePortId: 'field:recording', targetNodeKey: 'transcribe', targetPortId: 'audio' },
      { sourceNodeKey: 'transcribe', sourcePortId: 'text', targetNodeKey: 'voice', targetPortId: 'text' },
      { sourceNodeKey: 'voice', sourcePortId: 'audio', targetNodeKey: 'convert', targetPortId: 'source' },
      { sourceNodeKey: 'convert', sourcePortId: 'audio', targetNodeKey: 'output', targetPortId: 'field:recording' },
    ],
  }), structuredClone(initialProject));
  assert.deepEqual(prepared.safePreview.warnings, []);
  assert.equal(prepared.patch.nodes.length, 5);
  assert.equal(prepared.patch.edges.length, 4);
  const applied = applyPipelineBuildPatch(structuredClone(initialProject), prepared.patch);
  assert.equal(applied.nodes.length, 5);
  assert.ok(applied.nodes.every((node) => node.status === 'idle'));
});

test('Voice authoring accepts 30000 characters like the server, rejects overflow, and cannot forge recovery requests', () => {
  assert.equal(MAX_SPEECH_TEXT_CHARACTERS, 30_000);
  const text = 'Т'.repeat(MAX_SPEECH_TEXT_CHARACTERS);
  assert.deepEqual(sanitizePipelineNodeSettings('textToSpeech', { localText: text }), { localText: text });
  const warnings: string[] = [];
  assert.deepEqual(sanitizePipelineNodeSettings('textToSpeech', { localText: `${text}Т`, speechRequest: {
    idempotencyKey: 'forged', jobId: 'foreign', fingerprint: 'forged',
  } }, 'voice', warnings), {});
  assert.equal(warnings.length, 2);
  const schema = createPipelineSettingsSchema() as { properties: { localText: { anyOf: Array<{ maxLength?: number }> } } };
  assert.equal(schema.properties.localText.anyOf[0]?.maxLength, MAX_SPEECH_TEXT_CHARACTERS);
});

test('Import audio stream selection is bounded and does not grant file ownership or authored derived results', () => {
  assert.deepEqual(sanitizePipelineNodeSettings('importImage', {
    videoAudioTrackIndex: 2, mediaKind: 'video', assetId: 'foreign-source',
    videoAudioAssetId: 'forged-audio', videoOnlyAssetId: 'forged-video', videoPreviewAssetId: 'forged-preview',
    videoDerivedSourceAssetId: 'foreign-source', videoDerivedAudioTrackIndex: 2, videoPreviewAudioTrackIndex: 2,
  }), { videoAudioTrackIndex: 2 });
  for (const index of [-1, 32, 1.5, '0:v:0', 'https://example.com/video.mp4']) {
    assert.deepEqual(sanitizePipelineNodeSettings('importImage', { videoAudioTrackIndex: index }), {});
  }
  assert.deepEqual(sanitizePipelineNodeSettings('speechToText', { videoAudioTrackIndex: 1 }), {});
  const schema = createPipelineSettingsSchema() as { properties: { videoAudioTrackIndex: { anyOf: Array<Record<string, unknown>> } } };
  assert.deepEqual(Object.fromEntries(Object.entries(schema.properties.videoAudioTrackIndex.anyOf[0]!).filter(([key]) => key !== 'description')),
    { type: 'integer', minimum: 0, maximum: 31 });
});

test('assistant boundary contracts expose scalar video fields in both canonical validator and public tool schema', () => {
  const fields = [{ id: 'clip', key: 'clip', kind: 'video' as const, required: true }];
  assert.deepEqual(pipelineContractFieldsSchema.parse(fields), fields);
  for (const type of ['pipelineInput', 'pipelineOutput'] as const) {
    assert.deepEqual(sanitizePipelineNodeSettings(type, { fields }), { fields });
  }
  const schema = createPipelineSettingsSchema() as { properties: { fields: { anyOf: Array<{
    items?: { properties?: { kind?: { enum?: string[] } } };
  }> } } };
  assert.ok(schema.properties.fields.anyOf[0]?.items?.properties?.kind?.enum?.includes('video'));
  assert.deepEqual(sanitizePipelineNodeSettings('pipelineOutput', { fields: [{ ...fields[0], kind: 'video_collection' }] }), {});
});
