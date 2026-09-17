import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { expect, test } from '@playwright/test';
import { z } from 'zod';
import { audioMetadataSchema } from '../src/shared/media/audio-contracts';
import { videoMetadataSchema } from '../src/shared/media/video-contracts';
import { runtimeV2GrantSchema, runtimeV2PipelineVersionDescriptorSchema } from '../src/modules/executable-pipelines/contracts/runtime-v2-descriptor-contracts';
import { runtimeV2RunSchema } from '../src/modules/executable-pipelines/contracts/runtime-v2-run-contracts';
import { AudioQaHttp, createAudioQaOwner, parseQaJson } from './audio-runtime-fixtures';
import { createVideoQaFixture, createVideoQaSnapshot, videoQaCapability, videoQaForm } from './video-import-http-fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });
test.describe.configure({ retries: 0 });
const assetFields = { id: z.uuid(), contentType: z.string(), byteSize: z.number().int().positive(), checksumSha256: z.string().regex(/^[a-f0-9]{64}$/) };
const videoEnvelope = z.object({ asset: z.object({ ...assetFields, mediaKind: z.literal('video'), video: videoMetadataSchema }) });
const audioEnvelope = z.object({ asset: z.object({ ...assetFields, mediaKind: z.literal('audio'), audio: audioMetadataSchema }) });
const artifactSchema = z.object({ kind: z.enum(['video', 'audio']), assetId: z.uuid(), mimeType: z.string(), sizeBytes: z.number().int().positive(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/), contentUrl: z.string(), hasAudio: z.boolean().optional() });
const scopes = ['pipeline.catalog.read', 'pipeline.descriptor.read', 'pipeline.run.create', 'pipeline.run.read', 'pipeline.artifact.read'];

test('local video HTTP upload -> cached original/silent/audio -> pinned service run and protected artifacts', async ({}, testInfo) => {
  test.skip(process.env.AUDIO_LOCAL_E2E !== '1', 'Explicit local-only audio/video E2E opt-in is required.');
  test.setTimeout(180_000);
  const origin = new URL(String(testInfo.project.use.baseURL));
  expect(['127.0.0.1', 'localhost'].includes(origin.hostname) && origin.protocol === 'http:' && origin.port === '3004').toBe(true);
  expect(origin.username === '' && origin.password === '').toBe(true);
  const originalBytes = createVideoQaFixture();
  expect(originalBytes.length).toBeLessThan(1024 * 1024);
  const originalHash = sha(originalBytes);
  const owner = await createAudioQaOwner(origin.origin, 'video-owner');
  const other = await createAudioQaOwner(origin.origin, 'video-isolation');
  const anonymous = new AudioQaHttp(origin.origin);
  const credentials: string[] = [];
  const evidence: Record<string, unknown> = { retainedQaWorkspaces: [owner.workspaceId, other.workspaceId], syntheticMediaOnly: true, providerCalls: 0 };
  try {
    const project = (await parseQaJson(await owner.http.request('/api/projects', { json: {
      workspaceId: owner.workspaceId, name: 'Video Runtime QA — isolated synthetic picture and tone',
    } }), 201, z.object({ project: z.object({ id: z.uuid() }) }))).project;
    const original = (await parseQaJson(await owner.http.request('/api/assets/video', { form: videoQaForm(originalBytes, owner.workspaceId, project.id) }), 201, videoEnvelope)).asset;
    expect(original.contentType).toBe('video/mp4'); expect(original.video.codec).toBe('h264'); expect(original.video.audioTracks).toHaveLength(1);
    expect(original.checksumSha256).toBe(originalHash); expect(original.byteSize).toBe(originalBytes.length);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    expect((await owner.http.request('/api/assets/video', { form: videoQaForm(png, owner.workspaceId) })).status).toBe(415);
    const common = { workspaceId: owner.workspaceId, assetId: original.id };
    const audio = (await parseQaJson(await owner.http.request('/api/assets/video/derive', { json: { ...common, kind: 'audio' } }), 200, audioEnvelope)).asset;
    const audioAgain = (await parseQaJson(await owner.http.request('/api/assets/video/derive', { json: { ...common, kind: 'audio', audioTrackIndex: original.video.audioTracks[0]!.index } }), 200, audioEnvelope)).asset;
    expect(audioAgain.id).toBe(audio.id); expect(audio.contentType).toBe('audio/mp4'); expect(audio.audio.codec).toBe('aac');
    const silent = (await parseQaJson(await owner.http.request('/api/assets/video/derive', { json: { ...common, kind: 'video-only' } }), 200, videoEnvelope)).asset;
    const silentAgain = (await parseQaJson(await owner.http.request('/api/assets/video/derive', { json: { ...common, kind: 'video-only' } }), 200, videoEnvelope)).asset;
    expect(silentAgain.id).toBe(silent.id); expect(silent.video.audioTracks).toHaveLength(0); expect(silent.video.codec).toBe('h264');
    expect(new Set([original.id, silent.id, audio.id]).size).toBe(3);
    const preview = (await parseQaJson(await owner.http.request('/api/assets/video/derive', { json: { ...common, kind: 'preview' } }), 200, videoEnvelope)).asset;
    expect(preview.id).toBe(original.id); // Already browser-compatible; do not create another file.
    for (const asset of [original, silent, audio]) {
      const download = await owner.http.request(`/api/assets/${asset.id}/content`);
      expect(download.status).toBe(200); expect(download.headers.get('content-type')).toBe(asset.contentType);
      const bytes = Buffer.from(await download.arrayBuffer()); expect(bytes.length).toBe(asset.byteSize); expect(sha(bytes)).toBe(asset.checksumSha256);
      expect((await anonymous.request(`/api/assets/${asset.id}/content`)).status).toBe(401);
      expect((await other.http.request(`/api/assets/${asset.id}/content`)).status).toBe(404);
    }
    expect(sha(Buffer.from(await (await owner.http.request(`/api/assets/${original.id}/content`)).arrayBuffer()))).toBe(originalHash);
    expect((await anonymous.request('/api/assets/video', { form: videoQaForm(originalBytes, owner.workspaceId) })).status).toBe(401);
    expect((await anonymous.request('/api/assets/video/derive', { json: { ...common, kind: 'audio' } })).status).toBe(401);
    expect((await other.http.request('/api/assets/video/derive', { json: { ...common, kind: 'audio' } })).status).toBe(403);
    expect((await other.http.request('/api/assets/video/derive', { json: { ...common, workspaceId: other.workspaceId, kind: 'audio' } })).status).toBe(404);
    expect((await owner.http.request('/api/assets/video', { form: videoQaForm(originalBytes, other.workspaceId) })).status).toBe(403);
    expect((await owner.http.request('/api/assets/video/derive', { json: { ...common, kind: 'audio', audioTrackIndex: 31 } })).status).toBe(422);
    expect((await owner.http.request('/api/assets/video/derive', { json: { workspaceId: owner.workspaceId, assetId: silent.id, kind: 'audio' } })).status).toBe(422);

    const publication = (await parseQaJson(await owner.http.request(`/api/projects/${project.id}/pipelines`, { json: {
      sectionId: 'video-qa', snapshot: createVideoQaSnapshot(original.id, original.video.audioTracks[0]!.index),
    } }), 201, z.object({ pipeline: z.object({ endpointPublicId: z.string(), version: z.number().int().positive() }) }))).pipeline;
    const base = `/api/workspaces/${owner.workspaceId}/runtime-connections`;
    const descriptor = (await parseQaJson(await owner.http.request(`${base}/pipelines/${publication.endpointPublicId}/versions/${publication.version}`),
      200, z.object({ descriptor: runtimeV2PipelineVersionDescriptorSchema }))).descriptor;
    expect(descriptor.output.fields.original?.kind).toBe('video'); expect(descriptor.output.fields.video?.kind).toBe('video'); expect(descriptor.output.fields.audio?.kind).toBe('audio');
    const client = (await parseQaJson(await owner.http.request(`${base}/clients`, { json: { displayName: 'Video Runtime QA client', sourceApplication: 'video-runtime-qa', externalWorkspaceRef: randomUUID(), scopes } }),
      201, z.object({ client: z.object({ id: z.uuid() }) }))).client;
    const issued = await parseQaJson(await owner.http.request(`${base}/clients/${client.id}/credentials`, { json: { label: 'Video Runtime QA one-hour key', scopes: null,
      expiresAt: new Date(Date.now() + 3600_000).toISOString() } }), 201, z.object({ token: z.string().min(1), credential: z.object({ id: z.uuid() }) }));
    credentials.push(`${base}/clients/${client.id}/credentials/${issued.credential.id}/revoke`);
    const runtime = new AudioQaHttp(origin.origin, issued.token);
    const grant = (await parseQaJson(await owner.http.request(`${base}/clients/${client.id}/grants`, { json: {
      pipeline: descriptor.pipelinePublicId, capabilityKey: videoQaCapability, version: descriptor.version.version, checksum: descriptor.version.checksum,
      inputSchemaChecksum: descriptor.version.inputSchemaChecksum, outputSchemaChecksum: descriptor.version.outputSchemaChecksum,
      updatePolicy: 'PINNED', executionPolicy: { maxAttempts: 1 }, costPolicy: { mode: 'STRICT', maximumProviderCostUsd: '0' },
    } }), 201, z.object({ grant: runtimeV2GrantSchema }))).grant;
    const body = { input: {}, expectedGrantRevision: grant.revision, maximumProviderCostUsd: '0', correlationId: randomUUID(), consumerReference: { test: 'video-local-e2e' } };
    const key = randomUUID(); const path = `/v2/runtime/grants/${grant.id}/runs`;
    const accepted = await parseQaJson(await runtime.request(path, { json: body, key }), 202, runtimeV2RunSchema);
    const replay = await parseQaJson(await runtime.request(path, { json: body, key }), 202, runtimeV2RunSchema);
    expect(replay.id).toBe(accepted.id); expect(replay.idempotentReplay).toBe(true);
    let completed = accepted;
    await expect.poll(async () => { completed = await parseQaJson(await runtime.request(`/v2/runtime/runs/${accepted.id}`), 200, runtimeV2RunSchema); return completed.status; },
      { timeout: 60_000, intervals: [300, 500, 1000] }).toBe('succeeded');
    expect(completed.usage.providerCallCount).toBe(0); expect(completed.usage.actualProviderCostUsd).toBe('0.00000000');
    expect(completed.usage.state).toBe('COMPLETE'); expect(completed.pipeline.checksum).toBe(grant.pinned.checksum);
    const outputs = { original: artifactSchema.parse(completed.outputs?.original), video: artifactSchema.parse(completed.outputs?.video), audio: artifactSchema.parse(completed.outputs?.audio) };
    expect(outputs.original.assetId).toBe(original.id); expect(outputs.video.hasAudio).toBe(false); expect(outputs.audio.kind).toBe('audio');
    expect(outputs.video.assetId).toBe(silent.id); expect(outputs.audio.assetId).toBe(audio.id);
    for (const artifact of Object.values(outputs)) {
      expect(artifact.contentUrl).toBe(`/v2/runtime/runs/${accepted.id}/artifacts/${artifact.assetId}`);
      const downloaded = await runtime.request(artifact.contentUrl); expect(downloaded.status).toBe(200);
      expect(downloaded.headers.get('content-type')).toBe(artifact.mimeType); expect(downloaded.headers.get('cache-control')).toBe('private, no-store');
      expect(sha(Buffer.from(await downloaded.arrayBuffer()))).toBe(artifact.checksumSha256);
      expect((await anonymous.request(artifact.contentUrl)).status).toBe(401);
    }
    Object.assign(evidence, { documentId: project.id, originalAssetId: original.id, audioAssetId: audio.id, silentAssetId: silent.id,
      checksumSha256: originalHash, originalSizeBytes: originalBytes.length, pipelinePublicId: descriptor.pipelinePublicId, version: grant.pinned.version,
      runId: accepted.id, negatives: ['image-disguised-as-video', 'anonymous', 'foreign-workspace', 'unknown-track', 'silent-source'], cacheReplayVerified: true });
  } finally {
    let failedRevocations = 0;
    for (const path of credentials) { try { if ((await owner.http.request(path, { method: 'POST' })).status !== 200) failedRevocations += 1; } catch { failedRevocations += 1; } }
    const evidencePath = testInfo.outputPath('video-runtime-redacted-evidence.json');
    await mkdir(dirname(evidencePath), { recursive: true });
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await testInfo.attach('video-runtime-redacted-evidence', { contentType: 'application/json', path: evidencePath });
    expect(failedRevocations, 'Video QA key revocation failed; test-created keys also expire in one hour.').toBe(0);
  }
});

function sha(bytes: Uint8Array) { return createHash('sha256').update(bytes).digest('hex'); }
