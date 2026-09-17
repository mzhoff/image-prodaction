import assert from 'node:assert/strict';
import test from 'node:test';
import { createVideoCropPipelineHandler } from './pipeline-video-crop-handler';
import type { PipelineNodeHandlerInput } from '../contracts/pipeline-contracts';

const video = { kind: 'video' as const, assetId: 'stored-video', checksumSha256: 'a'.repeat(64) };
const crop = { x: 0.1, y: 0.2, width: 0.5, height: 0.6 };
function input(): PipelineNodeHandlerInput {
  return { nodeId: 'crop', config: { aspectRatio: 'Custom', crop }, inputs: { video },
    signal: new AbortController().signal,
    context: { runId: 'run', workspaceId: 'workspace', pipelineId: 'pipeline', pipelineVersion: 1, sourceApplication: 'test' } };
}

test('Crop derives the current video artifact and supports aspect-only recipes without cached results', async () => {
  const requests: unknown[] = [];
  const result = { ...video, assetId: 'cropped-video' };
  const handler = createVideoCropPipelineHandler({ async deriveVideo(request) { requests.push(request); return result; } });
  const original = input();
  assert.deepEqual(await handler.execute(original), { videoResult: result });
  assert.deepEqual(requests[0], { ...original, artifact: video, kind: 'crop', crop, aspectRatio: 'Custom' });
  const aspectOnly = { ...input(), config: { aspectRatio: '9:16' } };
  assert.deepEqual(await handler.execute(aspectOnly), { videoResult: result });
});

test('Crop rejects non-video, mixed inputs, unbounded rectangles and URL/cached-result substitutions before derivation', async () => {
  let calls = 0;
  const handler = createVideoCropPipelineHandler({ async deriveVideo() { calls++; return video; } });
  const base = input();
  const requests: PipelineNodeHandlerInput[] = [
    { ...base, inputs: { video: 'https://example.test/video.mp4' } },
    { ...base, inputs: { video: { kind: 'image', assetId: 'image' } } },
    { ...base, inputs: { video, image: { kind: 'image', assetId: 'image' } } },
    { ...base, inputs: {} },
    { ...base, config: { ...base.config, crop: { ...crop, x: 0.9 } } },
    { ...base, config: { ...base.config, crop: { ...crop, width: 0 } } },
    { ...base, config: { ...base.config, resultAssetId: 'client-result' } },
    { ...base, config: { ...base.config, aspectRatio: 'NaN:1' } },
  ];
  for (const request of requests) await assert.rejects(() => handler.execute(request), /requires one video artifact/);
  assert.equal(calls, 0);
});

test('Crop checks cancellation before and after derivation and rejects wrong output types', async () => {
  const controller = new AbortController(); controller.abort();
  const handler = createVideoCropPipelineHandler({ async deriveVideo() { assert.fail('must not derive'); } });
  await assert.rejects(() => handler.execute({ ...input(), signal: controller.signal }), /abort/i);
  const late = new AbortController();
  const cancelled = createVideoCropPipelineHandler({ async deriveVideo() { late.abort(); return video; } });
  await assert.rejects(() => cancelled.execute({ ...input(), signal: late.signal }), /abort/i);
  const wrong = createVideoCropPipelineHandler({ async deriveVideo() { return { kind: 'image', assetId: 'poster' }; } });
  await assert.rejects(() => wrong.execute(input()), /valid video artifact/);
});
