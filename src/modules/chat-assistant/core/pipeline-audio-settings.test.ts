import assert from 'node:assert/strict';
import test from 'node:test';
import { initialProject } from '@/entities/production-graph/model/initial-project';
import { applyPipelineBuildPatch, parsePipelineBuildInput, preparePipelineBuild } from './pipeline-build';
import { sanitizePipelineNodeSettings } from './pipeline-node-settings';

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
