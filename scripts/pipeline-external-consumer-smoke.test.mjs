import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  parseOptions,
  readImageDimensions,
  runPipelineConsumerSmoke,
} from './pipeline-external-consumer-smoke.mjs';

const checksum = 'a'.repeat(64);

test('option parsing is fail-closed around the pinned version and checksum', () => {
  assert.throws(
    () => parseOptions(['--base-url', 'http://localhost:3000', '--public-id', 'pln_test']),
    /expected-pipeline-checksum/,
  );
  const options = parseOptions([
    '--base-url', 'http://localhost:3000',
    '--public-id', 'pln_test',
    '--expected-version', '3',
    '--expected-pipeline-checksum', checksum,
    '--conflict-input-file', '/tmp/conflict.json',
  ]);
  assert.equal(options.expectedVersion, 3);
  assert.equal(options.expectedPipelineChecksum, checksum);
  assert.equal(options.allowLegacyRuntime, false);
});

test('option parsing requires an explicit contract-valid conflict fixture', () => {
  assert.throws(() => parseOptions([
    '--base-url', 'http://localhost:3000',
    '--public-id', 'pln_test',
    '--expected-version', '3',
    '--expected-pipeline-checksum', checksum,
  ]), /conflict-input-file/);
});

test('image dimension readers cover PNG, GIF, and extended WebP headers', () => {
  const png = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(png);
  png.writeUInt32BE(1080, 16);
  png.writeUInt32BE(1920, 20);
  assert.deepEqual(readImageDimensions(png, 'image/png'), { width: 1080, height: 1920 });

  const gif = Buffer.alloc(10);
  gif.write('GIF89a', 0, 'ascii');
  gif.writeUInt16LE(320, 6);
  gif.writeUInt16LE(480, 8);
  assert.deepEqual(readImageDimensions(gif, 'image/gif'), { width: 320, height: 480 });

  const webp = Buffer.alloc(30);
  webp.write('RIFF', 0, 'ascii');
  webp.write('WEBP', 8, 'ascii');
  webp.write('VP8X', 12, 'ascii');
  writeUInt24LE(webp, 24, 1079);
  writeUInt24LE(webp, 27, 1919);
  assert.deepEqual(readImageDimensions(webp, 'image/webp'), { width: 1080, height: 1920 });
});

test('smoke client verifies descriptor, auth, replay, conflict, and text result', async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'pipeline-consumer-smoke-'));
  const tokenFile = join(temporaryDirectory, 'pipeline-token');
  const inputFile = join(temporaryDirectory, 'pipeline-input.json');
  const conflictInputFile = join(temporaryDirectory, 'pipeline-conflict-input.json');
  const secret = 'A'.repeat(43);
  const token = `rvr_pipe_${secret.slice(0, 12)}.${secret}`;
  await writeFile(tokenFile, `${token}\n`, { mode: 0o600 });
  await writeFile(inputFile, JSON.stringify({ input: 'hello' }), { mode: 0o600 });
  await writeFile(conflictInputFile, JSON.stringify({ input: 'different' }), { mode: 0o600 });

  let acceptedPayload = null;
  const runId = 'run_019fd_smoke';
  const server = createServer(async (request, response) => {
    const body = await readRequestJson(request);
    if (request.headers.authorization !== `Bearer ${token}`) {
      writeJson(response, 401, { error: { code: 'unauthorized' } });
      return;
    }
    if (request.method === 'GET' && request.url === '/v1/pipelines/pln_test') {
      writeJson(response, 200, {
        pipeline: {
          capabilityKey: 'article.summary.v1',
          publicId: 'pln_test',
          version: 3,
          checksum,
        },
        input: { schemaChecksum: null, fields: {}, semanticContract: null },
        output: { schemaChecksum: null, fields: {}, semanticContract: null },
      });
      return;
    }
    if (request.method === 'POST' && request.url === '/v1/pipelines/pln_test/runs') {
      if (acceptedPayload === null) {
        acceptedPayload = body;
        writeJson(response, 202, createRun({ idempotentReplay: false, runId, status: 'queued' }));
        return;
      }
      if (JSON.stringify(body) === JSON.stringify(acceptedPayload)) {
        writeJson(response, 202, createRun({ idempotentReplay: true, runId, status: 'queued' }));
        return;
      }
      writeJson(response, 409, { error: { code: 'pipeline_idempotency_conflict' } });
      return;
    }
    if (request.method === 'GET' && request.url === `/v1/runs/${runId}`) {
      writeJson(response, 200, createRun({
        idempotentReplay: false,
        outputs: { output: 'Generated text' },
        runId,
        status: 'succeeded',
      }));
      return;
    }
    writeJson(response, 404, { error: { code: 'not_found' } });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const result = await runPipelineConsumerSmoke([
      '--base-url', `http://127.0.0.1:${address.port}`,
      '--public-id', 'pln_test',
      '--expected-version', '3',
      '--expected-pipeline-checksum', checksum,
      '--expected-capability-key', 'article.summary.v1',
      '--token-file', tokenFile,
      '--input-file', inputFile,
      '--conflict-input-file', conflictInputFile,
      '--output-kind', 'text',
      '--poll-interval-ms', '250',
      '--max-wait-ms', '2000',
    ]);
    assert.deepEqual(result, {
      artifactCount: 0,
      capabilityKey: 'article.summary.v1',
      capabilityKeyVerified: true,
      descriptorMode: 'strict',
      durationMs: 1000,
      outputKind: 'text',
      pipelineChecksumVerified: true,
      pipelinePublicId: 'pln_test',
      pipelineVersion: 3,
      runId,
      status: 'succeeded',
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});

function createRun({ idempotentReplay, outputs = null, runId, status }) {
  return {
    attemptCount: status === 'queued' ? 0 : 1,
    createdAt: '2026-08-31T12:00:00.000Z',
    error: null,
    finishedAt: status === 'succeeded' ? '2026-08-31T12:00:01.000Z' : null,
    id: runId,
    idempotentReplay,
    maxAttempts: 3,
    outputs,
    pipeline: { publicId: 'pln_test', version: 3 },
    startedAt: status === 'queued' ? null : '2026-08-31T12:00:00.100Z',
    status,
    statusUrl: `/v1/runs/${runId}`,
  };
}

async function readRequestJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return null;
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function writeJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'Content-Length': Buffer.byteLength(body),
    'Content-Type': 'application/json',
  });
  response.end(body);
}

function writeUInt24LE(buffer, offset, value) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >> 8) & 0xff;
  buffer[offset + 2] = (value >> 16) & 0xff;
}
