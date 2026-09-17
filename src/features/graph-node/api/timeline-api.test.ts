import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareTimelineClip, prepareTimelineFrame, readTimelineJob, startTimelineJob, timelineFrameUrl, waitForTimelineJob } from './timeline-api';

test('API accepts queued null result and sends explicit scoped idempotent analyze payload', async () => {
  const original = globalThis.fetch;
  const scope = { workspaceId: 'workspace', documentId: 'document' };
  let body: unknown;
  globalThis.fetch = (async (_url, options) => {
    body = options?.body ? JSON.parse(String(options.body)) : undefined;
    return Response.json({ job: { id: 'job', status: 'queued' }, result: null });
  }) as typeof fetch;
  try {
    const response = await startTimelineJob({ action: 'analyze', assetId: 'source', threshold: 10 }, scope, 'stable-key');
    assert.deepEqual(body, { action: 'analyze', assetId: 'source', threshold: 10, ...scope, idempotencyKey: 'stable-key' });
    assert.equal(response.result, undefined);
    assert.equal((await readTimelineJob('job')).job.status, 'queued');
  } finally { globalThis.fetch = original; }
});

test('failed batch delivers partial result before exposing error; completed shots survive', async () => {
  const partial = { sourceAssetId: '01900000-0000-7000-8000-000000000111', sourceChecksum: 'a'.repeat(64), shots: [] };
  let received: unknown;
  await assert.rejects(waitForTimelineJob({ job: { id: 'job', status: 'failed', error: { message: 'Provider stopped', retryable: false } }, result: partial },
    { signal: new AbortController().signal, workspaceId: 'workspace', onUpdate: (response) => { received = response.result; } }), /Provider stopped/);
  assert.equal(received, partial);
});

test('aborted polling does not deliver stale results and still URLs stay local and encoded', async () => {
  const controller = new AbortController(); controller.abort();
  let updates = 0;
  await assert.rejects(waitForTimelineJob({ job: { id: 'job', status: 'queued' } }, { signal: controller.signal, workspaceId: 'workspace', onUpdate: () => { updates++; } }));
  assert.equal(updates, 0);
  const url = new URL(timelineFrameUrl('workspace&other', 'source', 120.4), 'http://localhost');
  assert.equal(url.pathname, '/api/timeline/frame');
  assert.equal(url.searchParams.get('workspaceId'), 'workspace&other');
  assert.equal(url.searchParams.get('timeMs'), '120.4');
});

test('measured analysis progress reaches the UI and impossible counters are rejected', async () => {
  const original = globalThis.fetch;
  const analysis = { phase: 'detecting', processedFrames: 12, totalFrames: 24, processedMs: 500,
    totalMs: 1000, elapsedMs: 400, estimatedRemainingMs: 400 };
  globalThis.fetch = async () => Response.json({ job: { id: 'job', status: 'running' }, progress: { analysis } });
  try {
    assert.deepEqual((await readTimelineJob('job')).progress?.analysis, analysis);
    analysis.processedMs = 2000;
    await assert.rejects(readTimelineJob('job'));
  } finally { globalThis.fetch = original; }
});

test('still references use the exact local time and propagate cancellation without paid requests', async () => {
  const original = globalThis.fetch;
  const signal = new AbortController().signal;
  let requested = '';
  globalThis.fetch = async (url, init) => {
    requested = String(url); assert.equal(init?.signal, signal);
    return Response.json({ asset: { id: '01900000-0000-7000-8000-000000000123', originalName: 'frame.jpg',
      contentType: 'image/jpeg', width: 640, height: 360, createdAt: '2026-09-12T00:00:00Z' } });
  };
  try {
    const frame = await prepareTimelineFrame('workspace', 'source', 123.45, signal);
    assert.equal(frame.kind, 'image'); assert.deepEqual(frame.storage, { type: 'remote', assetId: frame.id });
    assert.equal(requested, '/api/timeline/frame?workspaceId=workspace&assetId=source&timeMs=123.45&format=json');
    const controller = new AbortController(); controller.abort();
    await assert.rejects(prepareTimelineClip('workspace', 'source', 0, 1000, controller.signal));
  } finally { globalThis.fetch = original; }
});
