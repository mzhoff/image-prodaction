import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeVideoCatalog } from './openrouter-video-catalog';
import { buildVideoProviderBody, createOpenRouterVideoAdapter } from './openrouter-video-adapter';
import { validateVideoRequest, videoRequestSchema } from '@/shared/media/video-generation-contracts';
import { VideoProviderError } from '../core/video-provider-error';

const raw = { id: 'google/veo-3.1-lite', name: 'Google: Veo 3.1 Lite', supported_durations: [8, 4, 6],
  supported_resolutions: ['720p', '1080p'], supported_aspect_ratios: ['16:9', '9:16'],
  supported_frame_images: ['first_frame', 'last_frame'], generate_audio: true, seed: true };
const model = normalizeVideoCatalog({ data: [raw] })[0];
const request = videoRequestSchema.parse({ model: raw.id, mode: 'text', prompt: 'A slow camera move', duration: 4, resolution: '720p', aspectRatio: '16:9' });
const image = { assetId: '019f1e15-0185-7000-8000-000000000001', description: '' };

test('video model discovery uses real discrete sets and fails closed on missing capability data', () => {
  assert.deepEqual(model.durations, [4, 6, 8]);
  assert.equal(model.route.gateway, 'openrouter'); assert.equal(model.key, raw.id);
  assert.equal(model.label, 'Veo 3.1 Lite');
  assert.equal(model.references, false);
  const [unknown] = normalizeVideoCatalog({ data: [{ ...raw, seed: null, generate_audio: null, supported_frame_images: null }] });
  assert.equal(unknown.seed, false); assert.equal(unknown.audio, false); assert.equal(unknown.firstFrame, false);
  assert.deepEqual(normalizeVideoCatalog({ data: [{ ...raw, supported_durations: null }, { ...raw, id: 'runway/aleph-2' }] }), []);
});
test('video request rejects unsupported settings, wrong modes and duplicate reference slots', () => {
  assert.equal(validateVideoRequest(request, model), undefined);
  for (const change of [{ duration: 5 }, { resolution: '4K' }, { firstFrame: image }, { mode: 'frames' as const },
    { mode: 'references' as const, references: [{ ...image, slot: 1 }] }]) assert.ok(validateVideoRequest({ ...request, ...change }, model));
  assert.equal(validateVideoRequest({ ...request, mode: 'frames', firstFrame: image, lastFrame: image }, model), undefined);
  assert.ok(validateVideoRequest({ ...request, mode: 'frames', firstFrame: image, lastFrame: image }, { ...model, lastFrame: false }));
  assert.ok(validateVideoRequest({ ...request, mode: 'references', references: [{ ...image, slot: 1 }, { ...image, slot: 1 }] }, { ...model, references: true }));
  assert.ok(validateVideoRequest({ ...request, seed: 2 }, { ...model, seed: false }));
  assert.ok(validateVideoRequest({ ...request, generateAudio: true }, { ...model, audio: false }));
});
test('reference descriptions follow ordered image identity, never shift into another slot', () => {
  const body = buildVideoProviderBody({ ...request, firstFrame: undefined, lastFrame: undefined, mode: 'references', references: [
    { slot: 3, url: 'data:image/jpeg;base64,Yw==', description: 'lighting' },
    { slot: 2, url: 'data:image/jpeg;base64,Yg==', description: 'character' },
  ] });
  assert.match(body.prompt, /Image 1 \(reference input 2\): character/);
  assert.match(body.prompt, /Image 2 \(reference input 3\): lighting/);
  assert.deepEqual(body.input_references?.map((item) => item.image_url.url), ['data:image/jpeg;base64,Yg==', 'data:image/jpeg;base64,Yw==']);
  assert.equal(body.frame_images, undefined);
  const frames = buildVideoProviderBody({ ...request, mode: 'frames', references: [], firstFrame: 'first', lastFrame: 'last' });
  assert.deepEqual(frames.frame_images?.map((item) => item.frame_type), ['first_frame', 'last_frame']);
});
test('video adapter pins credentialed requests to the fixed origin and ignores provider URLs', async () => {
  const calls: Array<{ url: string; options?: RequestInit }> = [];
  const adapter = createOpenRouterVideoAdapter(async (url, options) => {
    calls.push({ url: String(url), options });
    return String(url).includes('/content') ? new Response(new Uint8Array([1, 2])) : Response.json({ id: 'job_1', status: 'completed',
      generation_id: 'gen-1', polling_url: 'https://attacker.invalid', unsigned_urls: ['https://attacker.invalid'], usage: { cost: '0.125' } });
  });
  const context = { credential: 'test-not-a-secret', signal: new AbortController().signal };
  const result = await adapter.submit({ ...request, firstFrame: undefined, lastFrame: undefined, references: [] }, context);
  assert.equal(result.usage.providerCostUsd, '0.125');
  await adapter.poll(result.operationId, context); await adapter.download(result.operationId, context);
  assert.deepEqual(calls.map((call) => call.url), ['https://openrouter.ai/api/v1/videos', 'https://openrouter.ai/api/v1/videos/job_1', 'https://openrouter.ai/api/v1/videos/job_1/content?index=0']);
  assert.ok(calls.every((call) => call.options?.redirect === 'error'));
  await assert.rejects(adapter.download('../other-host', context)); assert.equal(calls.length, 3);
});
test('absent video cost remains unknown and malformed/mismatched operation responses fail', async () => {
  const context = { credential: 'test', signal: new AbortController().signal };
  const adapter = createOpenRouterVideoAdapter(async () => Response.json({ id: 'job_1', status: 'pending' }));
  assert.equal((await adapter.poll('job_1', context)).usage.complete, false);
  await assert.rejects(adapter.poll('different', context));
  const oversized = createOpenRouterVideoAdapter(async () => new Response('x', { headers: { 'content-length': String(129 * 1024 * 1024) } }));
  await assert.rejects(oversized.download('job_1', context), /128 MiB/);
});
test('early video status preserves the accepted job ID when accounting fields are null', async () => {
  const adapter = createOpenRouterVideoAdapter(async () => Response.json({ id: 'accepted', status: 'pending', generation_id: null, usage: null }));
  const result = await adapter.submit({ ...request, firstFrame: undefined, lastFrame: undefined, references: [] }, { credential: 'test', signal: new AbortController().signal });
  assert.equal(result.operationId, 'accepted'); assert.equal(result.generationId, undefined);
  assert.equal(result.usage.providerCostUsd, null);
});
test('video adapter exposes nested rejection and terminal provider error without leaking inputs', async () => {
  const context = { credential: 'test-secret', signal: new AbortController().signal, redactions: ['private prompt'] };
  const rejected = createOpenRouterVideoAdapter(async () => Response.json({ error: { code: 400,
    message: 'HTTP 400: {"error":{"code":"InputImageSensitiveContentDetected.PrivacyInformation","message":"Input image may contain real person."}}',
  } }, { status: 400, headers: { 'x-request-id': 'request-1' } }));
  await assert.rejects(rejected.submit({ ...request, references: [], firstFrame: undefined, lastFrame: undefined }, context), (error: unknown) => {
    assert.ok(error instanceof VideoProviderError);
    assert.equal(error.diagnostic.code, 'video_input_person_restricted');
    assert.equal(error.diagnostic.requestId, 'request-1');
    return true;
  });
  const failed = createOpenRouterVideoAdapter(async () => Response.json({ id: 'job_1', status: 'failed',
    error: 'Content policy violation: private prompt test-secret', usage: { cost: '0.1' } }));
  const status = await failed.poll('job_1', context);
  assert.equal(status.failure?.code, 'video_content_rejected');
  assert.equal(status.usage.providerCostUsd, '0.1');
  assert.doesNotMatch(JSON.stringify(status.failure), /private prompt|test-secret/);
});
test('non-JSON and oversized error bodies fall back to the HTTP category', async () => {
  for (const body of ['<html>Gateway error</html>', 'x'.repeat(65537)]) {
    const adapter = createOpenRouterVideoAdapter(async () => new Response(body, { status: 400 }));
    await assert.rejects(adapter.submit({ ...request, references: [], firstFrame: undefined, lastFrame: undefined }, { credential: 'test', signal: new AbortController().signal }),
      (error: unknown) => error instanceof VideoProviderError && error.diagnostic.code === 'video_invalid_request' && !error.diagnostic.detail);
  }
});
