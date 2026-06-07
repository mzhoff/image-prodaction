import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { AssetRecord } from '@/entities/production-graph/model/types';
import { createId } from '@/shared/lib/id';

interface S3AssetConfig {
  accessKeyId?: string;
  bucket: string;
  endpoint?: string;
  forcePathStyle: boolean;
  publicBaseUrl: string;
  region: string;
  secretAccessKey?: string;
}

interface ImageBytes {
  buffer: Buffer;
  contentType: string;
}

interface UploadGeneratedImageOptions {
  namePrefix: string;
  sourceUrl: string;
}

interface UploadAssetBytesOptions {
  buffer: Buffer;
  contentType: string;
  fileName?: string;
  kind?: AssetRecord['kind'];
  namePrefix: string;
}

export type S3AssetRecord = AssetRecord & {
  storage: {
    type: 's3';
    bucket: string;
    key: string;
    publicUrl: string;
  };
};

let cachedClient: S3Client | null = null;
let cachedConfigKey = '';

export async function uploadGeneratedImageToS3({
  namePrefix,
  sourceUrl,
}: UploadGeneratedImageOptions): Promise<S3AssetRecord> {
  const image = await readImageBytes(sourceUrl);
  return uploadAssetBytesToS3({
    buffer: image.buffer,
    contentType: image.contentType,
    kind: 'image',
    namePrefix,
  });
}

export async function uploadAssetBytesToS3({
  buffer,
  contentType,
  fileName,
  kind = 'image',
  namePrefix,
}: UploadAssetBytesOptions): Promise<S3AssetRecord> {
  const config = getS3AssetConfig();
  const normalizedContentType = normalizeImageContentType(contentType) ?? inferImageContentType(buffer) ?? 'image/png';
  const assetId = createId('asset');
  const extension = getImageExtension(normalizedContentType, fileName);
  const assetName = fileName?.trim() || `${sanitizeFileNamePart(namePrefix)}-${Date.now()}.${extension}`;
  const key = getObjectKey(namePrefix, assetId, extension);
  const dimensions = kind === 'image' ? readImageDimensions(buffer, normalizedContentType) : undefined;

  await getS3Client(config).send(new PutObjectCommand({
    Body: buffer,
    Bucket: config.bucket,
    ContentType: normalizedContentType,
    Key: key,
  }));

  return {
    id: assetId,
    kind,
    name: assetName,
    mimeType: normalizedContentType,
    width: dimensions?.width,
    height: dimensions?.height,
    createdAt: new Date().toISOString(),
    storage: {
      type: 's3',
      bucket: config.bucket,
      key,
      publicUrl: buildPublicUrl(config.publicBaseUrl, key),
    },
  };
}

export async function deleteS3AssetObject({ bucket, key }: { bucket: string; key: string }) {
  const config = getS3AssetConfig();
  await getS3Client(config).send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  }));
}

function getS3Client(config: S3AssetConfig) {
  const configKey = JSON.stringify({
    accessKeyId: config.accessKeyId,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    region: config.region,
    secretAccessKey: Boolean(config.secretAccessKey),
  });

  if (cachedClient && cachedConfigKey === configKey) return cachedClient;

  cachedClient = new S3Client({
    credentials: config.accessKeyId && config.secretAccessKey
      ? {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      }
      : undefined,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    region: config.region,
  });
  cachedConfigKey = configKey;
  return cachedClient;
}

function getS3AssetConfig(): S3AssetConfig {
  const bucket = getEnv('S3_BUCKET') ?? getEnv('AWS_S3_BUCKET');
  if (!bucket) throw new Error('S3_BUCKET is required to store generated images.');

  const region = getEnv('S3_REGION') ?? getEnv('AWS_REGION') ?? 'us-east-1';
  const endpoint = getEnv('S3_ENDPOINT');
  const publicBaseUrl = getEnv('S3_PUBLIC_BASE_URL') ?? getDefaultPublicBaseUrl({ bucket, endpoint, region });

  return {
    accessKeyId: getEnv('S3_ACCESS_KEY_ID') ?? getEnv('AWS_ACCESS_KEY_ID'),
    bucket,
    endpoint,
    forcePathStyle: parseBooleanEnv(getEnv('S3_FORCE_PATH_STYLE'), Boolean(endpoint)),
    publicBaseUrl,
    region,
    secretAccessKey: getEnv('S3_SECRET_ACCESS_KEY') ?? getEnv('AWS_SECRET_ACCESS_KEY'),
  };
}

async function readImageBytes(sourceUrl: string): Promise<ImageBytes> {
  if (sourceUrl.startsWith('data:')) return readDataUrlImage(sourceUrl);

  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Generated image download failed: ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  const headerContentType = normalizeImageContentType(response.headers.get('content-type'));
  const contentType = headerContentType ?? inferImageContentType(buffer) ?? inferImageContentTypeFromUrl(sourceUrl) ?? 'image/png';
  return { buffer, contentType };
}

function readDataUrlImage(dataUrl: string): ImageBytes {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) throw new Error('Generated image data URL is invalid.');

  const contentType = normalizeImageContentType(match[1]) ?? 'image/png';
  const payload = match[3];
  const buffer = match[2]
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload));

  return { buffer, contentType };
}

function getDefaultPublicBaseUrl({
  bucket,
  endpoint,
  region,
}: {
  bucket: string;
  endpoint?: string;
  region: string;
}) {
  if (endpoint) return `${endpoint.replace(/\/+$/, '')}/${encodeURIComponent(bucket)}`;
  return `https://${bucket}.s3.${region}.amazonaws.com`;
}

function buildPublicUrl(publicBaseUrl: string, key: string) {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return `${publicBaseUrl.replace(/\/+$/, '')}/${encodedKey}`;
}

function getObjectKey(namePrefix: string, assetId: string, extension: string) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${sanitizeFileNamePart(namePrefix)}/${year}/${month}/${day}/${assetId}.${extension}`;
}

function normalizeImageContentType(contentType: string | null | undefined) {
  const normalized = contentType?.split(';')[0]?.trim().toLowerCase();
  return normalized?.startsWith('image/') ? normalized : null;
}

function inferImageContentType(buffer: Buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
  if (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a') return 'image/gif';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

function inferImageContentTypeFromUrl(url: string) {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith('.png')) return 'image/png';
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
  if (pathname.endsWith('.webp')) return 'image/webp';
  if (pathname.endsWith('.gif')) return 'image/gif';
  return null;
}

function getImageExtension(contentType: string, fileName?: string) {
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/gif') return 'gif';
  if (contentType === 'image/svg+xml') return 'svg';
  const extension = fileName?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (extension && /^[a-z0-9]{1,8}$/.test(extension)) return extension;
  return 'png';
}

function sanitizeFileNamePart(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'generated';
}

function parseBooleanEnv(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function getEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readImageDimensions(buffer: Buffer, contentType: string) {
  if (contentType === 'image/png') return readPngDimensions(buffer);
  if (contentType === 'image/jpeg') return readJpegDimensions(buffer);
  if (contentType === 'image/webp') return readWebpDimensions(buffer);
  if (contentType === 'image/gif') return readGifDimensions(buffer);
  return undefined;
}

function readPngDimensions(buffer: Buffer) {
  if (buffer.length < 24) return undefined;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function readJpegDimensions(buffer: Buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return undefined;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return undefined;
    if (isJpegStartOfFrame(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return undefined;
}

function isJpegStartOfFrame(marker: number) {
  return marker >= 0xc0
    && marker <= 0xcf
    && ![0xc4, 0xc8, 0xcc].includes(marker);
}

function readGifDimensions(buffer: Buffer) {
  if (buffer.length < 10) return undefined;
  return {
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8),
  };
}

function readWebpDimensions(buffer: Buffer) {
  if (buffer.length < 30) return undefined;

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.subarray(offset, offset + 4).toString('ascii');
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;

    if (chunkType === 'VP8X' && dataOffset + 10 <= buffer.length) {
      return {
        width: readUInt24LE(buffer, dataOffset + 4) + 1,
        height: readUInt24LE(buffer, dataOffset + 7) + 1,
      };
    }

    if (chunkType === 'VP8L' && dataOffset + 5 <= buffer.length && buffer[dataOffset] === 0x2f) {
      const bits = buffer.readUInt32LE(dataOffset + 1);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }

    if (chunkType === 'VP8 ' && dataOffset + 10 <= buffer.length) {
      return {
        width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff,
      };
    }

    offset = dataOffset + chunkSize + (chunkSize % 2);
  }

  return undefined;
}

function readUInt24LE(buffer: Buffer, offset: number) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}
