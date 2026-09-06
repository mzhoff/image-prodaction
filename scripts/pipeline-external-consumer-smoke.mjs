import { createHash, randomUUID } from 'node:crypto';
import { lstat, open, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const TERMINAL_STATUSES = new Set(['canceled', 'failed', 'succeeded']);
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const PUBLIC_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const DEFAULT_TOKEN_FILE = '/run/secrets/pipeline_token';
const DEFAULT_INPUT_FILE = '/run/configs/pipeline-input.json';

export class PipelineConsumerSmokeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'PipelineConsumerSmokeError';
  }
}

export async function runPipelineConsumerSmoke(rawArguments = process.argv.slice(2)) {
  const options = parseOptions(rawArguments);
  const token = await readTokenFile(options.tokenFile);
  const input = await readJsonObjectFile(options.inputFile, options.maxInputBytes, 'Pipeline input');
  const conflictInput = await readJsonObjectFile(
    options.conflictInputFile,
    options.maxInputBytes,
    'Conflict input',
  );
  const endpointUrl = new URL(`/v1/pipelines/${encodeURIComponent(options.publicId)}`, options.baseUrl);

  const descriptor = await verifyDescriptor({ endpointUrl, options, token });
  if (descriptor.mode === 'legacy') {
    await verifyUnauthorizedRunRequest({ endpointUrl, input, options });
  }

  const idempotencyKey = `external-smoke-${Date.now()}-${randomUUID()}`;
  const submitUrl = new URL(`${endpointUrl.pathname}/runs`, options.baseUrl);
  const first = await requestJson(submitUrl, {
    method: 'POST',
    headers: authorizedJsonHeaders(token, idempotencyKey),
    body: JSON.stringify({ input }),
  }, options.requestTimeoutMs);
  assertStatus(first.response, 202, 'run_submit_failed');
  const createdRun = validateRunPayload(first.payload, options, 'Initial run');
  if (createdRun.idempotentReplay !== false) {
    throw new PipelineConsumerSmokeError(
      'fresh_run_was_replay',
      'The first request unexpectedly resolved to an existing run.',
    );
  }
  if (createdRun.maxAttempts > options.maxAllowedAttempts) {
    await cancelRunBestEffort(options.baseUrl, createdRun.id, token, options.requestTimeoutMs);
    throw new PipelineConsumerSmokeError(
      'attempt_limit_exceeded',
      `The consumer permits ${createdRun.maxAttempts} attempts; the smoke limit is ${options.maxAllowedAttempts}. The run was canceled best-effort.`,
    );
  }

  const replay = await requestJson(submitUrl, {
    method: 'POST',
    headers: authorizedJsonHeaders(token, idempotencyKey),
    body: JSON.stringify({ input }),
  }, options.requestTimeoutMs);
  assertStatus(replay.response, 202, 'run_replay_failed');
  const replayedRun = validateRunPayload(replay.payload, options, 'Idempotent replay');
  if (replayedRun.id !== createdRun.id || replayedRun.idempotentReplay !== true) {
    if (replayedRun.id !== createdRun.id) {
      await cancelRunBestEffort(options.baseUrl, replayedRun.id, token, options.requestTimeoutMs);
    }
    throw new PipelineConsumerSmokeError(
      'idempotent_replay_mismatch',
      'The replay did not return the same run with idempotentReplay=true.',
    );
  }

  const conflict = await requestJson(submitUrl, {
    method: 'POST',
    headers: authorizedJsonHeaders(token, idempotencyKey),
    body: JSON.stringify({ input: conflictInput }),
  }, options.requestTimeoutMs);
  if (conflict.response.status !== 409) {
    const unexpectedRunId = readSafeRunId(conflict.payload);
    if (conflict.response.status === 202 && unexpectedRunId && unexpectedRunId !== createdRun.id) {
      await cancelRunBestEffort(options.baseUrl, unexpectedRunId, token, options.requestTimeoutMs);
    }
    throw new PipelineConsumerSmokeError(
      'idempotency_conflict_missing',
      `A changed payload with the same Idempotency-Key returned HTTP ${conflict.response.status}, expected 409. Supply --conflict-input-file if the derived probe is outside the pipeline input contract.`,
    );
  }

  const finalRun = await pollRun({
    options,
    runId: createdRun.id,
    initialRun: createdRun,
    token,
  });
  if (finalRun.status !== 'succeeded') {
    throw new PipelineConsumerSmokeError(
      'run_not_succeeded',
      `Pipeline run reached terminal status ${finalRun.status}${formatRunError(finalRun.error)}.`,
    );
  }
  if (!finalRun.outputs || typeof finalRun.outputs !== 'object' || Array.isArray(finalRun.outputs)) {
    throw new PipelineConsumerSmokeError('outputs_missing', 'Succeeded run has no output object.');
  }

  const outputSummary = await validateOutputs({
    options,
    outputs: finalRun.outputs,
    runId: finalRun.id,
    token,
  });

  return {
    artifactCount: outputSummary.artifactCount,
    capabilityKey: descriptor.capabilityKey,
    capabilityKeyVerified: options.expectedCapabilityKey
      ? descriptor.mode === 'strict'
      : null,
    descriptorMode: descriptor.mode,
    durationMs: durationBetween(finalRun.createdAt, finalRun.finishedAt),
    outputKind: outputSummary.outputKind,
    pipelineChecksumVerified: descriptor.mode === 'strict',
    pipelinePublicId: options.publicId,
    pipelineVersion: finalRun.pipeline.version,
    runId: finalRun.id,
    status: finalRun.status,
  };
}

export function parseOptions(argumentsList) {
  const raw = new Map();
  const booleanFlags = new Set(['allow-legacy-runtime']);
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (!argument?.startsWith('--')) {
      throw new PipelineConsumerSmokeError('invalid_arguments', `Unexpected positional argument: ${argument ?? ''}`);
    }
    const separatorIndex = argument.indexOf('=');
    const name = argument.slice(2, separatorIndex === -1 ? undefined : separatorIndex);
    if (raw.has(name)) {
      throw new PipelineConsumerSmokeError('invalid_arguments', `Option --${name} was provided more than once.`);
    }
    if (booleanFlags.has(name)) {
      const value = separatorIndex === -1 ? 'true' : argument.slice(separatorIndex + 1);
      raw.set(name, value);
      continue;
    }
    const inlineValue = separatorIndex === -1 ? null : argument.slice(separatorIndex + 1);
    const value = inlineValue ?? argumentsList[index + 1];
    if (!value || (inlineValue === null && value.startsWith('--'))) {
      throw new PipelineConsumerSmokeError('invalid_arguments', `Option --${name} requires a value.`);
    }
    raw.set(name, value);
    if (inlineValue === null) index += 1;
  }

  const knownOptions = new Set([
    ...booleanFlags,
    'base-url',
    'conflict-input-file',
    'expected-input-schema-checksum',
    'expected-capability-key',
    'expected-output-schema-checksum',
    'expected-pipeline-checksum',
    'expected-version',
    'input-file',
    'max-allowed-attempts',
    'max-artifact-bytes',
    'max-artifacts',
    'max-input-bytes',
    'max-wait-ms',
    'output-kind',
    'poll-interval-ms',
    'public-id',
    'request-timeout-ms',
    'token-file',
  ]);
  for (const name of raw.keys()) {
    if (!knownOptions.has(name)) {
      throw new PipelineConsumerSmokeError('invalid_arguments', `Unknown option --${name}.`);
    }
  }

  const baseUrl = normalizeBaseUrl(requireOption(raw, 'base-url'));
  const publicId = requireOption(raw, 'public-id');
  if (!PUBLIC_ID_PATTERN.test(publicId)) {
    throw new PipelineConsumerSmokeError('invalid_arguments', 'Pipeline public ID has an invalid format.');
  }
  const expectedPipelineChecksum = normalizeChecksum(
    requireOption(raw, 'expected-pipeline-checksum'),
    'Expected pipeline checksum',
  );

  return {
    allowLegacyRuntime: readBoolean(raw.get('allow-legacy-runtime') ?? 'false', '--allow-legacy-runtime'),
    baseUrl,
    conflictInputFile: requireOption(raw, 'conflict-input-file'),
    expectedCapabilityKey: readOptionalCapabilityKey(raw.get('expected-capability-key')),
    expectedInputSchemaChecksum: readOptionalChecksum(raw, 'expected-input-schema-checksum'),
    expectedOutputSchemaChecksum: readOptionalChecksum(raw, 'expected-output-schema-checksum'),
    expectedPipelineChecksum,
    expectedVersion: readBoundedInteger(raw, 'expected-version', 1, Number.MAX_SAFE_INTEGER, null),
    inputFile: raw.get('input-file') ?? DEFAULT_INPUT_FILE,
    maxAllowedAttempts: readBoundedInteger(raw, 'max-allowed-attempts', 1, 10, 3),
    maxArtifactBytes: readBoundedInteger(raw, 'max-artifact-bytes', 1_024, 25_000_000, 20_000_000),
    maxArtifacts: readBoundedInteger(raw, 'max-artifacts', 1, 8, 4),
    maxInputBytes: readBoundedInteger(raw, 'max-input-bytes', 2, 256_000, 128_000),
    maxWaitMs: readBoundedInteger(raw, 'max-wait-ms', 1_000, 300_000, 90_000),
    outputKind: readOutputKind(raw.get('output-kind') ?? 'auto'),
    pollIntervalMs: readBoundedInteger(raw, 'poll-interval-ms', 250, 5_000, 1_000),
    publicId,
    requestTimeoutMs: readBoundedInteger(raw, 'request-timeout-ms', 1_000, 30_000, 10_000),
    tokenFile: raw.get('token-file') ?? DEFAULT_TOKEN_FILE,
  };
}

async function verifyDescriptor({ endpointUrl, options, token }) {
  const unauthorized = await requestJson(endpointUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  }, options.requestTimeoutMs);

  if (unauthorized.response.status === 404 || unauthorized.response.status === 405) {
    if (!options.allowLegacyRuntime) {
      throw new PipelineConsumerSmokeError(
        'descriptor_unavailable',
        'The running Image Production container does not expose GET /v1/pipelines/{publicId}. Rebuild/restart it before a paid smoke run, or pass --allow-legacy-runtime for an explicit version-only compatibility check.',
      );
    }
    return { capabilityKey: null, mode: 'legacy' };
  }
  assertStatus(unauthorized.response, 401, 'authentication_check_failed');

  const authorized = await requestJson(endpointUrl, {
    method: 'GET',
    headers: authorizedHeaders(token),
  }, options.requestTimeoutMs);
  assertStatus(authorized.response, 200, 'descriptor_request_failed');
  const capabilityKey = validateDescriptorPayload(authorized.payload, options);
  return { capabilityKey, mode: 'strict' };
}

async function verifyUnauthorizedRunRequest({ endpointUrl, input, options }) {
  const probe = await requestJson(new URL(`${endpointUrl.pathname}/runs`, options.baseUrl), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Idempotency-Key': `unauthorized-smoke-${randomUUID()}`,
    },
    body: JSON.stringify({ input }),
  }, options.requestTimeoutMs);
  assertStatus(probe.response, 401, 'authentication_check_failed');
}

export function validateDescriptorPayload(payload, options) {
  if (!isRecord(payload) || !isRecord(payload.pipeline)) {
    throw new PipelineConsumerSmokeError('descriptor_invalid', 'Pipeline descriptor has an invalid shape.');
  }
  if (payload.pipeline.publicId !== options.publicId) {
    throw new PipelineConsumerSmokeError('descriptor_mismatch', 'Descriptor public ID does not match the requested pipeline.');
  }
  if (payload.pipeline.version !== options.expectedVersion) {
    throw new PipelineConsumerSmokeError(
      'descriptor_mismatch',
      `Pinned pipeline version is ${String(payload.pipeline.version)}, expected ${options.expectedVersion}.`,
    );
  }
  assertChecksumEquals(
    payload.pipeline.checksum,
    options.expectedPipelineChecksum,
    'Pinned pipeline checksum',
  );
  const capabilityKey = payload.pipeline.capabilityKey;
  if (capabilityKey !== null && !isCapabilityKey(capabilityKey)) {
    throw new PipelineConsumerSmokeError('descriptor_invalid', 'Descriptor capabilityKey is invalid.');
  }
  if (
    options.expectedCapabilityKey &&
    capabilityKey !== options.expectedCapabilityKey
  ) {
    throw new PipelineConsumerSmokeError(
      'descriptor_mismatch',
      `Pinned capability key is ${String(capabilityKey)}, expected ${options.expectedCapabilityKey}.`,
    );
  }
  validateDescriptorSide(payload.input, 'input', options.expectedInputSchemaChecksum);
  validateDescriptorSide(payload.output, 'output', options.expectedOutputSchemaChecksum);
  return capabilityKey;
}

function validateDescriptorSide(value, side, expectedSchemaChecksum) {
  if (!isRecord(value) || !isRecord(value.fields)) {
    throw new PipelineConsumerSmokeError('descriptor_invalid', `Descriptor ${side} contract is invalid.`);
  }
  if (expectedSchemaChecksum) {
    assertChecksumEquals(value.schemaChecksum, expectedSchemaChecksum, `${side} schema checksum`);
  } else if (value.schemaChecksum !== null && value.schemaChecksum !== undefined) {
    normalizeChecksum(value.schemaChecksum, `${side} schema checksum`);
  }
}

function validateRunPayload(payload, options, label) {
  if (!isRecord(payload)
    || typeof payload.id !== 'string'
    || !PUBLIC_ID_PATTERN.test(payload.id)
    || !isRecord(payload.pipeline)
    || payload.pipeline.publicId !== options.publicId
    || payload.pipeline.version !== options.expectedVersion
    || !Number.isSafeInteger(payload.attemptCount)
    || !Number.isSafeInteger(payload.maxAttempts)
    || typeof payload.status !== 'string') {
    throw new PipelineConsumerSmokeError('run_payload_invalid', `${label} response has an invalid shape.`);
  }
  return payload;
}

async function pollRun({ options, runId, initialRun, token }) {
  const deadline = Date.now() + options.maxWaitMs;
  let current = initialRun;
  while (!TERMINAL_STATUSES.has(current.status)) {
    if (Date.now() >= deadline) {
      await cancelRunBestEffort(options.baseUrl, runId, token, options.requestTimeoutMs);
      throw new PipelineConsumerSmokeError(
        'poll_timeout',
        `Pipeline run did not finish within ${options.maxWaitMs} ms and was canceled best-effort.`,
      );
    }
    await delay(Math.min(options.pollIntervalMs, Math.max(0, deadline - Date.now())));
    const status = await requestJson(new URL(`/v1/runs/${encodeURIComponent(runId)}`, options.baseUrl), {
      method: 'GET',
      headers: authorizedHeaders(token),
    }, options.requestTimeoutMs);
    assertStatus(status.response, 200, 'run_status_failed');
    current = validateRunPayload(status.payload, options, 'Run status');
    if (current.id !== runId) {
      throw new PipelineConsumerSmokeError('run_payload_invalid', 'Status response returned a different run ID.');
    }
  }
  return current;
}

async function validateOutputs({ options, outputs, runId, token }) {
  const artifacts = collectImageArtifacts(outputs);
  const textValues = collectTextValues(outputs);
  if (options.outputKind === 'image' && artifacts.length === 0) {
    throw new PipelineConsumerSmokeError('image_output_missing', 'No image artifact was found in pipeline outputs.');
  }
  if (options.outputKind === 'text' && textValues.length === 0) {
    throw new PipelineConsumerSmokeError('text_output_missing', 'No non-empty text was found in pipeline outputs.');
  }
  if (options.outputKind === 'auto' && artifacts.length === 0 && textValues.length === 0) {
    throw new PipelineConsumerSmokeError('output_empty', 'Pipeline outputs contain neither text nor image artifacts.');
  }
  if (artifacts.length > options.maxArtifacts) {
    throw new PipelineConsumerSmokeError(
      'artifact_limit_exceeded',
      `Pipeline returned ${artifacts.length} image artifacts; smoke limit is ${options.maxArtifacts}.`,
    );
  }

  for (const artifact of artifacts) {
    await validateImageArtifact({ artifact, options, runId, token });
  }
  return {
    artifactCount: artifacts.length,
    outputKind: artifacts.length > 0 ? 'image' : 'text',
  };
}

async function validateImageArtifact({ artifact, options, runId, token }) {
  if (typeof artifact.assetId !== 'string' || !PUBLIC_ID_PATTERN.test(artifact.assetId)) {
    throw new PipelineConsumerSmokeError('artifact_contract_invalid', 'Image artifact has an invalid assetId.');
  }
  const expectedMimeType = normalizeImageMimeType(artifact.mimeType);
  const expectedChecksum = normalizeChecksum(artifact.checksumSha256, 'Artifact checksum');
  const expectedWidth = readPositiveInteger(artifact.width, 'Artifact width');
  const expectedHeight = readPositiveInteger(artifact.height, 'Artifact height');
  const expectedSize = readPositiveInteger(artifact.sizeBytes, 'Artifact sizeBytes');
  const canonicalPath = `/v1/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifact.assetId)}`;
  if (typeof artifact.contentUrl !== 'string') {
    throw new PipelineConsumerSmokeError('artifact_contract_invalid', 'Image artifact has no contentUrl.');
  }
  const declaredUrl = new URL(artifact.contentUrl, options.baseUrl);
  if (declaredUrl.origin !== options.baseUrl.origin || declaredUrl.pathname !== canonicalPath) {
    throw new PipelineConsumerSmokeError(
      'artifact_url_invalid',
      'Artifact contentUrl is not the canonical same-origin run artifact URL.',
    );
  }

  const response = await fetchWithTimeout(new URL(canonicalPath, options.baseUrl), {
    method: 'GET',
    headers: authorizedHeaders(token),
    redirect: 'error',
  }, options.requestTimeoutMs);
  assertStatus(response, 200, 'artifact_download_failed');
  const actualMimeType = normalizeImageMimeType(response.headers.get('content-type'));
  if (actualMimeType !== expectedMimeType) {
    throw new PipelineConsumerSmokeError('artifact_mime_mismatch', 'Downloaded artifact MIME type does not match its contract.');
  }
  const bytes = await readResponseBytes(response, options.maxArtifactBytes);
  if (bytes.byteLength !== expectedSize) {
    throw new PipelineConsumerSmokeError('artifact_size_mismatch', 'Downloaded artifact byte length does not match sizeBytes.');
  }
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && Number(contentLength) !== bytes.byteLength) {
    throw new PipelineConsumerSmokeError('artifact_size_mismatch', 'Content-Length does not match downloaded artifact bytes.');
  }
  const actualChecksum = createHash('sha256').update(bytes).digest('hex');
  if (actualChecksum !== expectedChecksum) {
    throw new PipelineConsumerSmokeError('artifact_checksum_mismatch', 'Downloaded artifact SHA-256 does not match its contract.');
  }
  const dimensions = readImageDimensions(bytes, actualMimeType);
  if (!dimensions || dimensions.width !== expectedWidth || dimensions.height !== expectedHeight) {
    throw new PipelineConsumerSmokeError('artifact_dimensions_mismatch', 'Downloaded image dimensions do not match its contract.');
  }
}

function collectImageArtifacts(value, artifacts = []) {
  if (Array.isArray(value)) {
    for (const entry of value) collectImageArtifacts(entry, artifacts);
    return artifacts;
  }
  if (!isRecord(value)) return artifacts;
  if (value.kind === 'image') {
    artifacts.push(value);
    return artifacts;
  }
  for (const entry of Object.values(value)) collectImageArtifacts(entry, artifacts);
  return artifacts;
}

function collectTextValues(value, values = []) {
  if (typeof value === 'string') {
    if (value.trim()) values.push(value);
    return values;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectTextValues(entry, values);
    return values;
  }
  if (!isRecord(value) || value.kind === 'image' || value.kind === 'audio') return values;
  for (const entry of Object.values(value)) collectTextValues(entry, values);
  return values;
}

export function readImageDimensions(bytes, mimeType) {
  if (mimeType === 'image/png') return readPngDimensions(bytes);
  if (mimeType === 'image/jpeg') return readJpegDimensions(bytes);
  if (mimeType === 'image/webp') return readWebpDimensions(bytes);
  if (mimeType === 'image/gif') return readGifDimensions(bytes);
  return null;
}

function readPngDimensions(bytes) {
  const signature = '89504e470d0a1a0a';
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== signature) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function readGifDimensions(bytes) {
  if (bytes.length < 10 || !['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) return null;
  return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
}

function readJpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 1 >= bytes.length) return null;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
      return {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
  }
  return null;
}

function readWebpDimensions(bytes) {
  if (bytes.length < 30
    || bytes.subarray(0, 4).toString('ascii') !== 'RIFF'
    || bytes.subarray(8, 12).toString('ascii') !== 'WEBP') return null;
  const chunkType = bytes.subarray(12, 16).toString('ascii');
  if (chunkType === 'VP8X') {
    return {
      width: 1 + readUInt24LE(bytes, 24),
      height: 1 + readUInt24LE(bytes, 27),
    };
  }
  if (chunkType === 'VP8L' && bytes[20] === 0x2f && bytes.length >= 25) {
    return {
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
    };
  }
  if (chunkType === 'VP8 ' && bytes.length >= 30
    && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }
  return null;
}

async function readResponseBytes(response, maxBytes) {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null && (!Number.isSafeInteger(Number(declaredLength)) || Number(declaredLength) > maxBytes)) {
    await response.body?.cancel().catch(() => undefined);
    throw new PipelineConsumerSmokeError('artifact_limit_exceeded', 'Artifact Content-Length exceeds the smoke byte limit.');
  }
  if (!response.body) throw new PipelineConsumerSmokeError('artifact_empty', 'Artifact response has no body.');
  const chunks = [];
  let totalBytes = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new PipelineConsumerSmokeError('artifact_limit_exceeded', 'Downloaded artifact exceeds the smoke byte limit.');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  if (totalBytes === 0) throw new PipelineConsumerSmokeError('artifact_empty', 'Downloaded artifact is empty.');
  return Buffer.concat(chunks, totalBytes);
}

async function requestJson(url, init, timeoutMs) {
  const response = await fetchWithTimeout(url, {
    ...init,
    redirect: 'error',
  }, timeoutMs);
  const payload = await readBoundedJson(response, 128_000);
  return { payload, response };
}

async function fetchWithTimeout(url, init, timeoutMs) {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new PipelineConsumerSmokeError(
      'network_request_failed',
      `Request to ${url.origin}${url.pathname} failed within the ${timeoutMs} ms bound (${error instanceof Error ? error.name : 'unknown error'}).`,
    );
  }
}

async function readBoundedJson(response, maxBytes) {
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') return null;
  const bytes = await readResponseBytesAllowEmpty(response, maxBytes);
  if (bytes.length === 0) return null;
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new PipelineConsumerSmokeError('invalid_json_response', 'Runtime returned invalid JSON.');
  }
}

async function readResponseBytesAllowEmpty(response, maxBytes) {
  if (!response.body) return Buffer.alloc(0);
  const chunks = [];
  let totalBytes = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new PipelineConsumerSmokeError('response_limit_exceeded', 'Runtime JSON response exceeds the smoke byte limit.');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, totalBytes);
}

async function cancelRunBestEffort(baseUrl, runId, token, requestTimeoutMs) {
  if (!PUBLIC_ID_PATTERN.test(runId)) return;
  await fetchWithTimeout(new URL(`/v1/runs/${encodeURIComponent(runId)}/cancel`, baseUrl), {
    method: 'POST',
    headers: authorizedHeaders(token),
    redirect: 'error',
  }, requestTimeoutMs).catch(() => undefined);
}

async function readTokenFile(filePath) {
  const stats = await lstat(filePath).catch(() => null);
  if (!stats?.isFile() || stats.isSymbolicLink() || stats.size < 20 || stats.size > 256) {
    throw new PipelineConsumerSmokeError('token_file_invalid', 'Pipeline token file is missing or invalid.');
  }
  if (!filePath.startsWith('/run/secrets/') && (stats.mode & 0o077) !== 0) {
    throw new PipelineConsumerSmokeError(
      'token_file_permissions',
      'Pipeline token file must not be readable by group or other users (use chmod 600).',
    );
  }
  const handle = await open(filePath, 'r');
  try {
    const token = (await handle.readFile({ encoding: 'utf8' })).trim();
    if (!/^rvr_pipe_[A-Za-z0-9_-]{12}\.[A-Za-z0-9_-]{43}$/.test(token)) {
      throw new PipelineConsumerSmokeError('token_file_invalid', 'Pipeline token file has an invalid token format.');
    }
    return token;
  } finally {
    await handle.close();
  }
}

async function readJsonObjectFile(filePath, maxBytes, label) {
  const stats = await lstat(filePath).catch(() => null);
  if (!stats?.isFile() || stats.isSymbolicLink() || stats.size < 2 || stats.size > maxBytes) {
    throw new PipelineConsumerSmokeError('input_file_invalid', `${label} file is missing or outside the byte limit.`);
  }
  let value;
  try {
    value = JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    throw new PipelineConsumerSmokeError('input_file_invalid', `${label} file is not valid JSON.`);
  }
  if (!isRecord(value)) {
    throw new PipelineConsumerSmokeError('input_file_invalid', `${label} must be a JSON object.`);
  }
  return value;
}

function authorizedHeaders(token) {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

function authorizedJsonHeaders(token, idempotencyKey) {
  return {
    ...authorizedHeaders(token),
    'Content-Type': 'application/json',
    'Idempotency-Key': idempotencyKey,
  };
}

function assertStatus(response, expectedStatus, code) {
  if (response.status !== expectedStatus) {
    throw new PipelineConsumerSmokeError(
      code,
      `Runtime returned HTTP ${response.status}, expected ${expectedStatus}.`,
    );
  }
}

function assertChecksumEquals(value, expected, label) {
  const actual = normalizeChecksum(value, label);
  if (actual !== expected) {
    throw new PipelineConsumerSmokeError('descriptor_mismatch', `${label} does not match the pinned expectation.`);
  }
}

function normalizeChecksum(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw new PipelineConsumerSmokeError('invalid_checksum', `${label} must be a SHA-256 hex digest.`);
  }
  return value.toLowerCase();
}

function normalizeImageMimeType(value) {
  if (typeof value !== 'string') {
    throw new PipelineConsumerSmokeError('artifact_contract_invalid', 'Image MIME type is missing.');
  }
  const normalized = value.split(';', 1)[0].trim().toLowerCase();
  if (!['image/gif', 'image/jpeg', 'image/png', 'image/webp'].includes(normalized)) {
    throw new PipelineConsumerSmokeError('artifact_contract_invalid', `Unsupported image MIME type: ${normalized || 'missing'}.`);
  }
  return normalized;
}

function normalizeBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new PipelineConsumerSmokeError('invalid_arguments', 'Base URL is invalid.');
  }
  if (!['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
    || url.search
    || url.hash) {
    throw new PipelineConsumerSmokeError('invalid_arguments', 'Base URL must be an HTTP(S) origin without credentials, query, or hash.');
  }
  url.pathname = '/';
  return url;
}

function readOptionalChecksum(values, name) {
  const value = values.get(name);
  return value === undefined ? null : normalizeChecksum(value, `--${name}`);
}

function readOptionalCapabilityKey(value) {
  if (value === undefined) return null;
  if (!isCapabilityKey(value)) {
    throw new PipelineConsumerSmokeError(
      'invalid_arguments',
      '--expected-capability-key must be a semantic capability key.',
    );
  }
  return value;
}

function isCapabilityKey(value) {
  return typeof value === 'string'
    && value.length <= 120
    && /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(value);
}

function readBoundedInteger(values, name, minimum, maximum, fallback) {
  const value = values.get(name);
  if (value === undefined && fallback !== null) return fallback;
  if (value === undefined) {
    throw new PipelineConsumerSmokeError('invalid_arguments', `Option --${name} is required.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new PipelineConsumerSmokeError(
      'invalid_arguments',
      `Option --${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return parsed;
}

function readBoolean(value, label) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new PipelineConsumerSmokeError('invalid_arguments', `${label} must be true or false.`);
}

function readOutputKind(value) {
  if (value === 'auto' || value === 'image' || value === 'text') return value;
  throw new PipelineConsumerSmokeError('invalid_arguments', '--output-kind must be auto, image, or text.');
}

function readPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new PipelineConsumerSmokeError('artifact_contract_invalid', `${label} must be a positive integer.`);
  }
  return value;
}

function requireOption(values, name) {
  const value = values.get(name);
  if (!value) throw new PipelineConsumerSmokeError('invalid_arguments', `Option --${name} is required.`);
  return value;
}

function readSafeRunId(payload) {
  return isRecord(payload) && typeof payload.id === 'string' && PUBLIC_ID_PATTERN.test(payload.id)
    ? payload.id
    : null;
}

function readUInt24LE(bytes, offset) {
  return bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16);
}

function formatRunError(error) {
  if (!isRecord(error) || typeof error.code !== 'string') return '';
  return ` (${error.code})`;
}

function durationBetween(start, end) {
  const startedAt = Date.parse(start);
  const finishedAt = Date.parse(end);
  return Number.isFinite(startedAt) && Number.isFinite(finishedAt)
    ? Math.max(0, finishedAt - startedAt)
    : null;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  try {
    const summary = await runPipelineConsumerSmoke();
    process.stdout.write(`${JSON.stringify({ ok: true, ...summary })}\n`);
  } catch (error) {
    const code = error instanceof PipelineConsumerSmokeError ? error.code : 'unexpected_error';
    const message = error instanceof Error ? error.message : 'Pipeline consumer smoke failed.';
    process.stderr.write(`[pipeline-consumer-smoke] FAIL code=${code} message=${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
