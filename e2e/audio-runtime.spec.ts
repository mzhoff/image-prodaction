import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { expect, test, type TestInfo } from '@playwright/test';
import { z } from 'zod';
import { runtimeV2GrantSchema, runtimeV2PipelineVersionDescriptorSchema } from '../src/modules/executable-pipelines/contracts/runtime-v2-descriptor-contracts';
import { runtimeV2RunSchema } from '../src/modules/executable-pipelines/contracts/runtime-v2-run-contracts';
import { runtimeAudioUploadResponseSchema } from '../src/modules/executable-pipelines/contracts/runtime-audio-contracts';
import { audioQaCapability, audioQaForm, AudioQaHttp, createAudioQaOwner, createAudioQaSnapshot, createAudioQaWave, parseQaJson } from './audio-runtime-fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });
test.describe.configure({ retries: 0 });
const idEnvelope = (key: string) => z.object({ [key]: z.object({ id: z.uuid() }) });
const audioArtifactSchema = z.object({ kind: z.literal('audio'), assetId: z.uuid(), mimeType: z.string(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/), sizeBytes: z.number().int().positive(), contentUrl: z.string() });
const scopes = ['pipeline.catalog.read', 'pipeline.descriptor.read', 'pipeline.run.create', 'pipeline.run.read',
  'pipeline.artifact.read', 'pipeline.asset.write'];

test('local audio M2M upload -> pinned deterministic MP3 run -> protected artifact', async ({}, testInfo) => {
  test.skip(process.env.AUDIO_LOCAL_E2E !== '1', 'Explicit local-only audio E2E opt-in is required.');
  test.setTimeout(180_000);
  const origin = new URL(String(testInfo.project.use.baseURL));
  expect(['127.0.0.1', 'localhost'].includes(origin.hostname) && origin.protocol === 'http:' && origin.port === '3004').toBe(true);
  expect(origin.username === '' && origin.password === '').toBe(true);
  const owner = await createAudioQaOwner(origin.origin, 'owner');
  const other = await createAudioQaOwner(origin.origin, 'isolation');
  expect(owner.workspaceId).not.toBe(other.workspaceId);
  await saveQaEvidence(testInfo, 'audio-runtime-qa-scope', {
    retainedQaWorkspaces: [owner.workspaceId, other.workspaceId], syntheticAudioOnly: true,
  });
  const credentials: Array<{ http: AudioQaHttp; path: string }> = [];
  try {
    const project = await parseQaJson(await owner.http.request('/api/projects', {
      json: { workspaceId: owner.workspaceId, name: 'Audio Runtime QA — isolated synthetic tone' },
    }), 201, idEnvelope('project'));
    const sessionUpload = await parseQaJson(await owner.http.request('/api/assets/audio', {
      form: audioQaForm(createAudioQaWave(), owner.workspaceId),
    }), 201, z.object({ asset: z.object({ id: z.uuid(), mediaKind: z.literal('audio'), contentType: z.literal('audio/wav') }) }));
    const sessionContent = await owner.http.request(`/api/assets/${sessionUpload.asset.id}/content`);
    expect(sessionContent.status).toBe(200);
    expect(Buffer.from(await sessionContent.arrayBuffer()).equals(createAudioQaWave())).toBe(true);

    const publication = await parseQaJson(await owner.http.request(`/api/projects/${project.project!.id}/pipelines`, {
      json: { sectionId: 'audio-qa', snapshot: createAudioQaSnapshot() },
    }), 201, z.object({ pipeline: z.object({ endpointPublicId: z.string(), version: z.number().int().positive() }) }));
    const base = `/api/workspaces/${owner.workspaceId}/runtime-connections`;
    const descriptor = (await parseQaJson(await owner.http.request(`${base}/pipelines/${publication.pipeline.endpointPublicId}/versions/${publication.pipeline.version}`),
      200, z.object({ descriptor: runtimeV2PipelineVersionDescriptorSchema }))).descriptor;
    expect(descriptor.input.fields.recording?.kind).toBe('audio');
    expect(descriptor.output.fields.result?.kind).toBe('audio');
    const client = await createClient(owner.http, base);
    const token = await issueKey(owner.http, base, client, credentials);
    const limited = await issueKey(owner.http, base, client, credentials, ['pipeline.run.read']);
    const runtime = new AudioQaHttp(origin.origin, token);
    const grant = (await parseQaJson(await owner.http.request(`${base}/clients/${client}/grants`, { json: {
      pipeline: descriptor.pipelinePublicId, capabilityKey: audioQaCapability,
      version: descriptor.version.version, checksum: descriptor.version.checksum,
      inputSchemaChecksum: descriptor.version.inputSchemaChecksum, outputSchemaChecksum: descriptor.version.outputSchemaChecksum,
      updatePolicy: 'PINNED', executionPolicy: { maxAttempts: 1 }, costPolicy: { mode: 'STRICT', maximumProviderCostUsd: '0' },
    } }), 201, z.object({ grant: runtimeV2GrantSchema }))).grant;

    const uploadKey = randomUUID();
    const upload = await parseQaJson(await runtime.request('/v2/runtime/assets/audio', { form: audioQaForm(createAudioQaWave()), key: uploadKey }), 201, runtimeAudioUploadResponseSchema);
    const uploadReplay = await parseQaJson(await runtime.request('/v2/runtime/assets/audio', { form: audioQaForm(createAudioQaWave()), key: uploadKey }), 201, runtimeAudioUploadResponseSchema);
    expect(uploadReplay.artifact.assetId).toBe(upload.artifact.assetId);
    expect((await runtime.request('/v2/runtime/assets/audio', { form: audioQaForm(createAudioQaWave(660)), key: uploadKey })).status).toBe(409);
    expect((await new AudioQaHttp(origin.origin, limited).request('/v2/runtime/assets/audio', { form: audioQaForm(createAudioQaWave()) })).status).toBe(403);
    expect((await new AudioQaHttp(origin.origin).request('/v2/runtime/assets/audio', { form: audioQaForm(createAudioQaWave()) })).status).toBe(401);

    const body = { input: { recording: upload.artifact }, expectedGrantRevision: grant.revision,
      maximumProviderCostUsd: '0', correlationId: randomUUID(), consumerReference: { test: 'audio-local-e2e' } };
    const runKey = randomUUID();
    const path = `/v2/runtime/grants/${grant.id}/runs`;
    const accepted = await parseQaJson(await runtime.request(path, { json: body, key: runKey }), 202, runtimeV2RunSchema);
    const replay = await parseQaJson(await runtime.request(path, { json: body, key: runKey }), 202, runtimeV2RunSchema);
    expect(replay.id).toBe(accepted.id); expect(replay.idempotentReplay).toBe(true);
    let completed = accepted;
    await expect.poll(async () => {
      completed = await parseQaJson(await runtime.request(`/v2/runtime/runs/${accepted.id}`), 200, runtimeV2RunSchema);
      return completed.status;
    }, { timeout: 60_000, intervals: [300, 500, 1000] }).toBe('succeeded');
    expect(completed.usage.state).toBe('COMPLETE');
    expect(completed.usage.providerCallCount).toBe(0);
    expect(completed.usage.actualProviderCostUsd).toBe('0.00000000');
    expect(completed.cost.enforcement).toBe('ENFORCED');
    expect(completed.pipeline.checksum).toBe(grant.pinned.checksum);
    const output = audioArtifactSchema.parse(completed.outputs?.result);
    expect(output.mimeType).toBe('audio/mpeg');
    expect(output.contentUrl).toBe(`/v2/runtime/runs/${accepted.id}/artifacts/${output.assetId}`);
    const download = await runtime.request(output.contentUrl);
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toBe('audio/mpeg');
    expect(download.headers.get('cache-control')).toBe('private, no-store');
    expect(download.headers.get('x-content-type-options')).toBe('nosniff');
    const bytes = Buffer.from(await download.arrayBuffer());
    expect(bytes.length).toBe(output.sizeBytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(output.checksumSha256);
    const probe = probeMp3(bytes);
    expect((await new AudioQaHttp(origin.origin).request(output.contentUrl)).status).toBe(401);
    expect((await runtime.request(`/v2/runtime/runs/${accepted.id}/artifacts/${upload.artifact.assetId}`)).status).toBe(404);

    const otherBase = `/api/workspaces/${other.workspaceId}/runtime-connections`;
    const otherClient = await createClient(other.http, otherBase);
    const otherRuntime = new AudioQaHttp(origin.origin, await issueKey(other.http, otherBase, otherClient, credentials));
    const foreign = await parseQaJson(await otherRuntime.request('/v2/runtime/assets/audio', { form: audioQaForm(createAudioQaWave()) }), 201, runtimeAudioUploadResponseSchema);
    expect((await otherRuntime.request(output.contentUrl)).status).toBe(404);
    expect((await otherRuntime.request(`/v2/runtime/runs/${accepted.id}`)).status).toBe(404);
    expect((await runtime.request(path, { json: { ...body, input: { recording: foreign.artifact } }, key: randomUUID() })).status).toBe(422);
    expect((await otherRuntime.request(path, { json: body, key: randomUUID() })).status).toBe(404);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    const image = await parseQaJson(await owner.http.request('/api/assets/images', { form: audioQaForm(png, owner.workspaceId, true) }), 201, idEnvelope('asset'));
    expect((await runtime.request(path, { json: { ...body, input: { recording: { kind: 'audio', assetId: image.asset!.id } } }, key: randomUUID() })).status).toBe(422);
    expect((await runtime.request(path, { json: { ...body, input: { recording: { kind: 'image', assetId: image.asset!.id } } }, key: randomUUID() })).status).toBe(422);
    await saveQaEvidence(testInfo, 'audio-runtime-redacted-evidence', {
      transport: 'HTTP; external requests use only service credential, no session cookies', providerCalls: 0,
      retainedQaWorkspaces: [owner.workspaceId, other.workspaceId], documentId: project.project!.id,
      pipelinePublicId: descriptor.pipelinePublicId, version: grant.pinned.version, runId: accepted.id,
      inputAssetId: upload.artifact.assetId, outputAssetId: output.assetId, mimeType: output.mimeType,
      sizeBytes: bytes.length, checksumSha256: output.checksumSha256, ffprobe: probe,
      negatives: ['missing-upload-scope', 'anonymous', 'foreign-workspace-input', 'foreign-run', 'undeclared-artifact', 'wrong-asset-kind'],
    });
  } finally {
    // Retain the tiny named QA fixtures for inspection; revoke only keys created by this test.
    let failedRevocations = 0;
    for (const credential of credentials) {
      try { if ((await credential.http.request(credential.path, { method: 'POST' })).status !== 200) failedRevocations += 1; }
      catch { failedRevocations += 1; }
    }
    expect(failedRevocations, 'QA key revocation failures; keys also expire after one hour.').toBe(0);
  }
});

async function createClient(http: AudioQaHttp, base: string) {
  return (await parseQaJson(await http.request(`${base}/clients`, { json: {
    displayName: 'Audio Runtime QA client', sourceApplication: 'audio-runtime-qa', externalWorkspaceRef: randomUUID(), scopes,
  } }), 201, idEnvelope('client'))).client!.id;
}

async function issueKey(http: AudioQaHttp, base: string, client: string, cleanup: Array<{ http: AudioQaHttp; path: string }>, restricted?: string[]) {
  const issued = await parseQaJson(await http.request(`${base}/clients/${client}/credentials`, {
    json: { label: 'Audio Runtime QA temporary key', scopes: restricted ?? null, expiresAt: new Date(Date.now() + 3600_000).toISOString() },
  }), 201, z.object({ token: z.string().min(1), credential: z.object({ id: z.uuid() }) }));
  cleanup.push({ http, path: `${base}/clients/${client}/credentials/${issued.credential.id}/revoke` });
  return issued.token;
}

function probeMp3(bytes: Buffer) {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,sample_rate,channels', '-of', 'json', 'pipe:0'], {
    input: bytes, encoding: 'utf8', timeout: 15_000, maxBuffer: 64 * 1024,
  });
  if (probe.error && 'code' in probe.error && probe.error.code === 'ENOENT') return 'not-installed; MIME and SHA-256 verified';
  expect(probe.status).toBe(0);
  const streams = z.object({ streams: z.array(z.object({ codec_name: z.literal('mp3'), sample_rate: z.literal('16000'), channels: z.literal(1) })).length(1) }).parse(JSON.parse(probe.stdout));
  return streams.streams[0]!;
}

async function saveQaEvidence(testInfo: TestInfo, name: string, evidence: Record<string, unknown>) {
  // Call sites use an explicit metadata allowlist; no response bodies, cookies, keys, or email links.
  const path = testInfo.outputPath(`${name}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  await testInfo.attach(name, { contentType: 'application/json', path });
}
