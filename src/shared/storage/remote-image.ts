import { isIP } from 'node:net';
import { resolve4, resolve6 } from 'node:dns/promises';
import { AssetValidationError, validateImageBytes } from './image-policy';
import type { ValidatedImage } from './image-policy';

export async function downloadRemoteImage(
  source: string,
  options: { maxBytes: number; timeoutMs: number },
): Promise<ValidatedImage> {
  if (source.startsWith('data:')) return decodeImageDataUrl(source, options.maxBytes);

  let url = parseAllowedUrl(source);
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    await assertPublicHost(url.hostname);
    const response = await fetch(url, {
      headers: { Accept: 'image/png,image/jpeg,image/webp,image/gif' },
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeoutMs),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirect === 3) throw new RemoteImageError('redirect_rejected', 'The image redirect could not be followed.');
      url = parseAllowedUrl(new URL(location, url).toString());
      continue;
    }

    if (!response.ok || !response.body) throw new RemoteImageError('download_failed', `The image provider returned ${response.status}.`);
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > options.maxBytes) throw new AssetValidationError('file_too_large', 'The image exceeds the download limit.');

    const bytes = await readLimitedBody(response.body, options.maxBytes);
    return validateImageBytes(bytes, {
      claimedContentType: response.headers.get('content-type'),
      maxBytes: options.maxBytes,
    });
  }

  throw new RemoteImageError('download_failed', 'The image could not be downloaded.');
}

export class RemoteImageError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RemoteImageError';
    this.code = code;
  }
}

function decodeImageDataUrl(dataUrl: string, maxBytes: number) {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) throw new RemoteImageError('invalid_data_url', 'The image data URL is invalid.');
  const buffer = match[2]
    ? Buffer.from(match[3], 'base64')
    : Buffer.from(decodeURIComponent(match[3]));
  return validateImageBytes(buffer, { claimedContentType: match[1], maxBytes });
}

function parseAllowedUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RemoteImageError('invalid_url', 'The image URL is invalid.');
  }
  if (url.protocol !== 'https:') throw new RemoteImageError('invalid_protocol', 'Only HTTPS image URLs are allowed.');
  if (url.username || url.password) throw new RemoteImageError('credentials_rejected', 'Credentials in image URLs are not allowed.');
  return url;
}

async function assertPublicHost(hostname: string) {
  const addresses = isIP(hostname)
    ? [hostname]
    : await Promise.all([resolve4(hostname).catch(() => []), resolve6(hostname).catch(() => [])]).then((items) => items.flat());
  if (addresses.length === 0) throw new RemoteImageError('host_unresolved', 'The image host could not be resolved.');
  if (addresses.some(isPrivateAddress)) throw new RemoteImageError('private_address', 'Private network image URLs are not allowed.');
}

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase();
  if (normalized.includes(':')) {
    return normalized === '::1'
      || normalized.startsWith('fc')
      || normalized.startsWith('fd')
      || normalized.startsWith('fe8')
      || normalized.startsWith('fe9')
      || normalized.startsWith('fea')
      || normalized.startsWith('feb')
      || normalized.startsWith('::ffff:127.')
      || normalized.startsWith('::ffff:10.')
      || normalized.startsWith('::ffff:192.168.');
  }

  const octets = normalized.split('.').map(Number);
  return octets[0] === 0
    || octets[0] === 10
    || octets[0] === 127
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
    || octets[0] >= 224;
}

async function readLimitedBody(body: ReadableStream<Uint8Array>, maxBytes: number) {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new AssetValidationError('file_too_large', 'The image exceeds the download limit.');
    }
    chunks.push(value);
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
