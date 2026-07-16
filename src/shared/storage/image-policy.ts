import { createHash } from 'node:crypto';

export const supportedImageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type SupportedImageType = typeof supportedImageTypes[number];

export interface ValidatedImage {
  buffer: Buffer;
  byteSize: number;
  checksumSha256: string;
  contentType: SupportedImageType;
  extension: 'png' | 'jpg' | 'webp' | 'gif';
  height?: number;
  width?: number;
}

export function validateImageBytes(
  input: Uint8Array,
  options: { claimedContentType?: string | null; maxBytes: number },
): ValidatedImage {
  const buffer = Buffer.from(input);
  if (buffer.length === 0) throw new AssetValidationError('empty_file', 'The image is empty.');
  if (buffer.length > options.maxBytes) throw new AssetValidationError('file_too_large', 'The image exceeds the upload limit.');

  const contentType = inferImageContentType(buffer);
  if (!contentType) throw new AssetValidationError('unsupported_image', 'The image signature is not supported.');

  const claimed = normalizeContentType(options.claimedContentType);
  if (claimed && claimed !== contentType) {
    throw new AssetValidationError('content_type_mismatch', 'The declared image type does not match its bytes.');
  }

  const dimensions = readImageDimensions(buffer, contentType);
  if (dimensions && (dimensions.width < 1 || dimensions.height < 1)) {
    throw new AssetValidationError('invalid_dimensions', 'The image dimensions are invalid.');
  }

  return {
    buffer,
    byteSize: buffer.length,
    checksumSha256: createHash('sha256').update(buffer).digest('hex'),
    contentType,
    extension: extensionByContentType[contentType],
    ...dimensions,
  };
}

export class AssetValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AssetValidationError';
    this.code = code;
  }
}

function normalizeContentType(value?: string | null) {
  const normalized = value?.split(';')[0]?.trim().toLowerCase();
  return supportedImageTypes.find((item) => item === normalized);
}

function inferImageContentType(buffer: Buffer): SupportedImageType | undefined {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
  const gifHeader = buffer.subarray(0, 6).toString('ascii');
  if (buffer.length >= 10 && (gifHeader === 'GIF87a' || gifHeader === 'GIF89a')) return 'image/gif';
  if (buffer.length >= 30 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return undefined;
}

function readImageDimensions(buffer: Buffer, contentType: SupportedImageType) {
  if (contentType === 'image/png') return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  if (contentType === 'image/gif') return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  if (contentType === 'image/jpeg') return readJpegDimensions(buffer);
  return readWebpDimensions(buffer);
}

function readJpegDimensions(buffer: Buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return undefined;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return undefined;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return undefined;
}

function readWebpDimensions(buffer: Buffer) {
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.subarray(offset, offset + 4).toString('ascii');
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (chunkType === 'VP8X' && dataOffset + 10 <= buffer.length) {
      return { width: readUInt24LE(buffer, dataOffset + 4) + 1, height: readUInt24LE(buffer, dataOffset + 7) + 1 };
    }
    if (chunkType === 'VP8L' && dataOffset + 5 <= buffer.length && buffer[dataOffset] === 0x2f) {
      const bits = buffer.readUInt32LE(dataOffset + 1);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunkType === 'VP8 ' && dataOffset + 10 <= buffer.length) {
      return { width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff, height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff };
    }
    offset = dataOffset + chunkSize + (chunkSize % 2);
  }
  return undefined;
}

function readUInt24LE(buffer: Buffer, offset: number) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

const extensionByContentType: Record<SupportedImageType, ValidatedImage['extension']> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
