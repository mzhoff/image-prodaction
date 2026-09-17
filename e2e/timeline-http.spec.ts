import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { z } from 'zod';
import { timelineAnalysisSchema } from '../src/shared/media/timeline-contracts';
import { videoMetadataSchema } from '../src/shared/media/video-contracts';
import { AudioQaHttp, createAudioQaOwner, parseQaJson } from './audio-runtime-fixtures';
import { createVideoQaFixture, videoQaForm } from './video-import-http-fixtures';

// Native fetch keeps session credentials out of browser traces and request diagnostics.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });
test.describe.configure({ retries: 0 });
const videoEnvelope = z.object({ asset: z.object({ id: z.uuid(), mediaKind: z.literal('video'), video: videoMetadataSchema,
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/), byteSize: z.number().int().positive() }) });
const responseSchema = z.object({ job: z.object({ id: z.uuid(), workspaceId: z.uuid(), documentId: z.uuid(),
  provider: z.literal('local'), operation: z.literal('timeline_analyze'), modelId: z.literal('ffmpeg-scdet-v1'),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'canceled']),
  error: z.object({ code: z.string(), retryable: z.boolean() }).nullish(),
}), result: timelineAnalysisSchema.nullable(), statusUrl: z.string() });

test('unpaid local Timeline HTTP: video upload -> durable analysis -> protected cached still and workspace isolation', async ({}, testInfo) => {
  test.skip(process.env.TIMELINE_LOCAL_E2E !== '1', 'Explicit local-only unpaid Timeline E2E opt-in is required.');
  test.setTimeout(240_000);
  const origin = new URL(String(testInfo.project.use.baseURL));
  expect(['127.0.0.1', 'localhost'].includes(origin.hostname) && origin.protocol === 'http:' && origin.port === '3004').toBe(true);
  expect(origin.username === '' && origin.password === '').toBe(true);
  const bytes = createVideoQaFixture();
  expect(bytes.length).toBeLessThan(1024 * 1024);
  const checksum = sha(bytes);
  const owner = await createAudioQaOwner(origin.origin, 'timeline-owner');
  const other = await createAudioQaOwner(origin.origin, 'timeline-isolation');
  const anonymous = new AudioQaHttp(origin.origin);
  const evidence: Record<string, unknown> = { syntheticMediaOnly: true, paidDescriptionRequests: 0,
    retainedQaWorkspaces: [owner.workspaceId, other.workspaceId] };
  try {
    const project = (await parseQaJson(await owner.http.request('/api/projects', { json: {
      workspaceId: owner.workspaceId, name: 'Timeline Handoff QA — unpaid synthetic video analysis',
    } }), 201, z.object({ project: z.object({ id: z.uuid() }) }))).project;
    const source = (await parseQaJson(await owner.http.request('/api/assets/video', {
      form: videoQaForm(bytes, owner.workspaceId, project.id),
    }), 201, videoEnvelope)).asset;
    expect(source.checksumSha256).toBe(checksum); expect(source.byteSize).toBe(bytes.length);
    const request = { action: 'analyze', workspaceId: owner.workspaceId, documentId: project.id,
      assetId: source.id, threshold: 10, idempotencyKey: randomUUID() };
    const accepted = await parseQaJson(await owner.http.request('/api/timeline', { json: request }), [200, 202], responseSchema);
    expect(accepted.job.workspaceId).toBe(owner.workspaceId); expect(accepted.job.documentId).toBe(project.id);
    expect(accepted.statusUrl).toBe(`/api/timeline/jobs/${accepted.job.id}`);
    const replay = await parseQaJson(await owner.http.request('/api/timeline', { json: request }), [200, 202], responseSchema);
    expect(replay.job.id).toBe(accepted.job.id);
    expect((await owner.http.request('/api/timeline', { json: { ...request, threshold: 20 } })).status).toBe(409);

    let completed = accepted;
    await expect.poll(async () => {
      completed = await parseQaJson(await owner.http.request(accepted.statusUrl), 200, responseSchema);
      if (completed.job.status === 'failed' && !completed.job.error?.retryable) throw new Error(`Synthetic Timeline analysis failed: ${completed.job.error?.code ?? 'unknown'}.`);
      return completed.job.status;
    }, { timeout: 90_000, intervals: [300, 500, 1000] }).toBe('succeeded');
    const timeline = timelineAnalysisSchema.parse(completed.result);
    expect(timeline.sourceAssetId).toBe(source.id); expect(timeline.sourceChecksum).toBe(checksum);
    expect(timeline.durationMs).toBeGreaterThan(1000); expect(timeline.durationMs).toBeLessThan(3000);
    expect(timeline.frameTimesMs.length).toBeGreaterThan(10);
    expect(timeline.shots[0]!.startMs).toBe(0); expect(timeline.shots.at(-1)!.endMs).toBe(timeline.durationMs);
    for (const [index, shot] of timeline.shots.entries()) {
      expect(shot.description).toBe(''); expect(shot.frames).toHaveLength(1);
      expect(timeline.frameTimesMs).toContain(shot.frames[0]!.timeMs);
      if (index > 0) expect(shot.startMs).toBe(timeline.shots[index - 1]!.endMs);
    }

    const timeMs = timeline.shots[0]!.frames[0]!.timeMs;
    const framePath = `/api/timeline/frame?${new URLSearchParams({ workspaceId: owner.workspaceId, assetId: source.id, timeMs: String(timeMs) })}`;
    const first = await owner.http.request(framePath);
    expect(first.status).toBe(200); expect(first.headers.get('content-type')).toBe('image/jpeg');
    expect(first.headers.get('cache-control')).toBe('private, no-store'); expect(first.headers.get('x-content-type-options')).toBe('nosniff');
    const frameId = z.uuid().parse(first.headers.get('x-asset-id'));
    const firstBytes = Buffer.from(await first.arrayBuffer());
    expect(firstBytes.length).toBeGreaterThan(4); expect(firstBytes.length).toBeLessThan(2 * 1024 * 1024);
    expect([...firstBytes.subarray(0, 2)]).toEqual([0xff, 0xd8]); expect([...firstBytes.subarray(-2)]).toEqual([0xff, 0xd9]);
    const cached = await owner.http.request(framePath);
    expect(cached.status).toBe(200); expect(cached.headers.get('x-asset-id')).toBe(frameId);
    expect(sha(Buffer.from(await cached.arrayBuffer()))).toBe(sha(firstBytes));

    expect((await anonymous.request('/api/timeline', { json: request })).status).toBe(401);
    expect((await anonymous.request(accepted.statusUrl)).status).toBe(401);
    expect((await anonymous.request(framePath)).status).toBe(401);
    expect((await other.http.request(accepted.statusUrl)).status).toBe(404);
    expect((await other.http.request('/api/timeline', { json: { ...request, idempotencyKey: randomUUID() } })).status).toBe(403);
    expect((await other.http.request(framePath)).status).toBe(403);
    expect((await other.http.request(`/api/timeline/frame?${new URLSearchParams({ workspaceId: other.workspaceId, assetId: source.id, timeMs: String(timeMs) })}`)).status).toBe(404);
    expect((await anonymous.request(`/api/assets/${frameId}/content`)).status).toBe(401);
    expect((await other.http.request(`/api/assets/${frameId}/content`)).status).toBe(404);
    expect((await owner.http.request(`/api/timeline/frame?${new URLSearchParams({ workspaceId: owner.workspaceId, assetId: source.id, timeMs: '-1' })}`)).status).toBe(400);
    expect(sha(Buffer.from(await (await owner.http.request(`/api/assets/${source.id}/content`)).arrayBuffer()))).toBe(checksum);
    const finalReplay = await parseQaJson(await owner.http.request('/api/timeline', { json: request }), 200, responseSchema);
    expect(finalReplay.job.id).toBe(accepted.job.id); expect(finalReplay.result).toEqual(timeline);
    Object.assign(evidence, { documentId: project.id, sourceAssetId: source.id, sourceChecksumSha256: checksum,
      jobId: accepted.job.id, shotCount: timeline.shots.length, frameCount: timeline.frameTimesMs.length, stillAssetId: frameId,
      idempotencyVerified: true, cachedStillVerified: true, sourceUnchanged: true,
      denied: ['anonymous', 'foreign-workspace', 'foreign-job', 'foreign-frame-asset', 'negative-timestamp', 'changed-idempotent-request'] });
  } finally {
    // The list reporter does not persist body-only attachments. Keep redacted proof on disk too.
    await mkdir(testInfo.outputDir, { recursive: true });
    const evidencePath = testInfo.outputPath('timeline-unpaid-redacted-evidence.json');
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await testInfo.attach('timeline-unpaid-redacted-evidence', {
      contentType: 'application/json', path: evidencePath,
    });
  }
});

function sha(bytes: Uint8Array) { return createHash('sha256').update(bytes).digest('hex'); }
