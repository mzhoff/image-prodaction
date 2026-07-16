import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';

export interface AssetObjectLocation {
  bucket: string;
  key: string;
}

export interface AssetObjectStore {
  delete(location: AssetObjectLocation): Promise<void>;
  get(location: AssetObjectLocation): Promise<{ body: ReadableStream; contentLength?: number; contentType?: string }>;
  health(): Promise<void>;
  put(input: AssetObjectLocation & { body: Uint8Array; contentType: string }): Promise<void>;
}

let cachedStore: AssetObjectStore | undefined;

export function getAssetObjectStore() {
  cachedStore ??= createS3AssetStore();
  return cachedStore;
}

export function createS3AssetStore(): AssetObjectStore {
  const config = readS3Config();
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: config.accessKeyId && config.secretAccessKey
      ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
      : undefined,
  });

  return {
    async health() {
      await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    },
    async put(input) {
      enforceConfiguredBucket(input.bucket, config.bucket);
      await client.send(new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ServerSideEncryption: config.endpoint ? undefined : 'AES256',
      }));
    },
    async get(location) {
      enforceConfiguredBucket(location.bucket, config.bucket);
      const result = await client.send(new GetObjectCommand({ Bucket: location.bucket, Key: location.key }));
      if (!result.Body) throw new Error('Asset object has no response body.');
      return {
        body: toWebStream(result.Body as Readable),
        contentLength: result.ContentLength,
        contentType: result.ContentType,
      };
    },
    async delete(location) {
      enforceConfiguredBucket(location.bucket, config.bucket);
      await client.send(new DeleteObjectCommand({ Bucket: location.bucket, Key: location.key }));
    },
  };
}

export function createAssetObjectKey(input: {
  assetId: string;
  documentId?: string | null;
  extension: string;
  workspaceId: string;
}) {
  const safeExtension = input.extension.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!safeExtension) throw new Error('A safe asset extension is required.');
  const documentSegment = input.documentId ?? 'unassigned';
  return `workspaces/${input.workspaceId}/documents/${documentSegment}/assets/${input.assetId}.${safeExtension}`;
}

export function getConfiguredAssetBucket() {
  return readRequiredEnv('S3_BUCKET');
}

function readS3Config() {
  return {
    accessKeyId: readOptionalEnv('S3_ACCESS_KEY_ID') ?? readOptionalEnv('AWS_ACCESS_KEY_ID'),
    bucket: readRequiredEnv('S3_BUCKET'),
    endpoint: readOptionalEnv('S3_ENDPOINT'),
    forcePathStyle: readBooleanEnv('S3_FORCE_PATH_STYLE', Boolean(readOptionalEnv('S3_ENDPOINT'))),
    region: readOptionalEnv('S3_REGION') ?? readOptionalEnv('AWS_REGION') ?? 'us-east-1',
    secretAccessKey: readOptionalEnv('S3_SECRET_ACCESS_KEY') ?? readOptionalEnv('AWS_SECRET_ACCESS_KEY'),
  };
}

function enforceConfiguredBucket(requested: string, configured: string) {
  if (requested !== configured) throw new Error('Asset bucket does not match server configuration.');
}

function toWebStream(stream: Readable) {
  return Readable.toWeb(stream) as ReadableStream;
}

function readRequiredEnv(name: string) {
  const value = readOptionalEnv(name);
  if (!value) throw new Error(`${name} is required for asset storage.`);
  return value;
}

function readOptionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function readBooleanEnv(name: string, fallback: boolean) {
  const value = readOptionalEnv(name);
  return value ? ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()) : fallback;
}
