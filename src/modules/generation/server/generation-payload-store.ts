import {
  getAssetObjectStore,
  getConfiguredAssetBucket,
  type AssetObjectStore,
} from '@/shared/storage/s3-assets';

const MAX_GENERATION_PAYLOAD_BYTES = 32 * 1024 * 1024;

export interface GenerationPayloadStore {
  delete(key: string): Promise<void>;
  read<T>(key: string): Promise<T>;
  readOptional<T>(key: string): Promise<T | null>;
  write<T>(input: {
    attemptCount?: number;
    jobId: string;
    kind: 'request' | 'result';
    payload: T;
    workspaceId: string;
  }): Promise<string>;
}

export function createGenerationPayloadStore(
  objectStore: AssetObjectStore = getAssetObjectStore(),
  bucket = getConfiguredAssetBucket(),
): GenerationPayloadStore {
  return {
    async write(input) {
      const key = createGenerationPayloadKey(input);
      const body = new TextEncoder().encode(JSON.stringify(input.payload));
      if (body.byteLength > MAX_GENERATION_PAYLOAD_BYTES) {
        throw new GenerationPayloadTooLargeError();
      }
      await objectStore.put({
        bucket,
        key,
        body,
        contentType: 'application/json',
      });
      return key;
    },
    async read<T>(key: string) {
      return readPayload<T>(objectStore, bucket, key);
    },
    async readOptional<T>(key: string) {
      try {
        return await readPayload<T>(objectStore, bucket, key);
      } catch (error) {
        if (isObjectNotFoundError(error)) return null;
        throw error;
      }
    },
    async delete(key) {
      assertGenerationPayloadKey(key);
      await objectStore.delete({ bucket, key });
    },
  };
}

export class GenerationPayloadTooLargeError extends Error {
  constructor() {
    super('Generation payload exceeds the configured size limit.');
    this.name = 'GenerationPayloadTooLargeError';
  }
}

export class GenerationPayloadInvalidError extends Error {
  constructor() {
    super('Generation payload is invalid.');
    this.name = 'GenerationPayloadInvalidError';
  }
}

export function createGenerationPayloadKey(input: {
  attemptCount?: number;
  jobId: string;
  kind: 'request' | 'result';
  workspaceId: string;
}) {
  const workspaceId = normalizeId(input.workspaceId);
  const jobId = normalizeId(input.jobId);
  const fileName = input.kind === 'result' && input.attemptCount !== undefined
    ? `result-attempt-${normalizeAttemptCount(input.attemptCount)}.json`
    : `${input.kind}.json`;
  return `workspaces/${workspaceId}/generation-jobs/${jobId}/${fileName}`;
}

async function readPayload<T>(
  objectStore: AssetObjectStore,
  bucket: string,
  key: string,
) {
  assertGenerationPayloadKey(key);
  const object = await objectStore.get({ bucket, key });
  if (
    typeof object.contentLength === 'number'
    && object.contentLength > MAX_GENERATION_PAYLOAD_BYTES
  ) {
    throw new GenerationPayloadTooLargeError();
  }
  const response = new Response(object.body);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_GENERATION_PAYLOAD_BYTES) {
    throw new GenerationPayloadTooLargeError();
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    throw new GenerationPayloadInvalidError();
  }
}

function isObjectNotFoundError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as {
    $metadata?: { httpStatusCode?: unknown };
    Code?: unknown;
    code?: unknown;
    name?: unknown;
  };
  return candidate.$metadata?.httpStatusCode === 404
    || ['NoSuchKey', 'NotFound', 'NoSuchObject'].includes(String(
      candidate.name ?? candidate.Code ?? candidate.code ?? '',
    ));
}

function assertGenerationPayloadKey(key: string) {
  if (
    !/^workspaces\/[0-9a-f-]+\/generation-jobs\/[0-9a-f-]+\/(?:request|result(?:-attempt-\d+)?)\.json$/i
      .test(key)
  ) {
    throw new GenerationPayloadInvalidError();
  }
}

function normalizeAttemptCount(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new GenerationPayloadInvalidError();
  }
  return value;
}

function normalizeId(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f-]{32,36}$/.test(normalized)) {
    throw new GenerationPayloadInvalidError();
  }
  return normalized;
}
