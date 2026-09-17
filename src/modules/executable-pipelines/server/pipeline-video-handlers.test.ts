import assert from 'node:assert/strict';
import test from 'node:test';
import { createVideoPipelineHandlers } from './pipeline-video-handlers';
import { getPipelineValueContractIssue } from '../core/pipeline-value-validation';
import { containsRuntimeArtifact, runtimeOutputArtifacts } from './runtime-v2-run-read';
import type { PipelineNodeHandlerInput } from '../contracts/pipeline-contracts';

const original = { kind: 'video' as const, assetId: '019ed347-66a4-7124-8000-000000000001', mimeType: 'video/mp4', checksumSha256: 'a'.repeat(64), hasAudio: true };
const audio = { kind: 'audio' as const, assetId: '019ed347-66a4-7124-8000-000000000002', mimeType: 'audio/mp4' };
const muted = { ...original, assetId: '019ed347-66a4-7124-8000-000000000003', hasAudio: false };
function input(outputPorts: string[], audioTrackIndex?: number): PipelineNodeHandlerInput {
  return { nodeId: 'import', config: { assetId: original.assetId, outputPorts, ...(audioTrackIndex !== undefined ? { audioTrackIndex } : {}) },
    context: { runId: 'run', workspaceId: 'workspace', pipelineId: 'pipeline', pipelineVersion: 1, sourceApplication: 'test' },
    inputs: {}, signal: new AbortController().signal,
  };
}
test('video Import resolves the original and derives only connected tracks', async () => {
  const calls: string[] = [];
  const handler = createVideoPipelineHandlers({
    async resolveVideo() { calls.push('source'); return original; },
    async deriveVideo(request) {
      calls.push(request.kind);
      assert.equal(request.artifact.assetId, original.assetId);
      if (request.kind === 'audio') { assert.equal(request.audioTrackIndex, 3); return audio; }
      assert.equal(request.audioTrackIndex, undefined);
      return muted;
    },
  })[0]!;
  assert.deepEqual(await handler.execute(input(['original'])), { original });
  assert.deepEqual(calls, ['source']);
  calls.length = 0;
  assert.deepEqual(await handler.execute(input(['video', 'audio'], 3)), { video: muted, audio });
  assert.deepEqual(calls, ['source', 'video-only', 'audio']);
});
test('video Import rejects invalid selectors, incoming URL substitution and wrong result type', async () => {
  let called = false;
  const handler = createVideoPipelineHandlers({ async resolveVideo() { called = true; return original; }, async deriveVideo() { return audio; } })[0]!;
  for (const invalid of [input(['unknown']), input(['audio'], -1), input(['audio'], 1.5), { ...input(['original']), inputs: { source: 'https://example.com/private.mp4' } }]) {
    await assert.rejects(() => handler.execute(invalid), /invalid outputs/);
  }
  assert.equal(called, false);
  await assert.rejects(() => handler.execute(input(['video'])), /valid video artifact/);
});
test('video Import propagates cancellation before any source read', async () => {
  const request = input(['audio']);
  const controller = new AbortController(); controller.abort(); request.signal = controller.signal;
  const handler = createVideoPipelineHandlers({ async resolveVideo() { assert.fail('must not read'); }, async deriveVideo() { assert.fail('must not derive'); } })[0]!;
  await assert.rejects(() => handler.execute(request), /abort/i);
});
test('video contracts require typed artifacts and runtime delivery strips storage internals', () => {
  assert.equal(getPipelineValueContractIssue(original, { kind: 'video', required: true }), null);
  assert.match(getPipelineValueContractIssue(audio, { kind: 'video', required: true })!, /video artifact/);
  assert.equal(containsRuntimeArtifact({ video: original }, original.assetId), true);
  const output = runtimeOutputArtifacts({ ...original, bucket: 'private', storageKey: 'secret', contentUrl: 'https://unsafe.example/video' }, 'run');
  assert.deepEqual(output, { ...original, contentUrl: `/v2/runtime/runs/run/artifacts/${original.assetId}` });
});
