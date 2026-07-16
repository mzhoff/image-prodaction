import { resolve4, resolve6 } from 'node:dns/promises';
import { isIP } from 'node:net';
import {
  AssetValidationError,
  supportedImageTypes,
  validateImageBytes,
  type SupportedImageType,
  type ValidatedImage,
} from './image-policy';

const MAX_REDIRECTS = 3;

export interface RemoteImageDependencies {
  fetch(input: URL, init: RequestInit): Promise<Response>;
  resolveHost(hostname: string): Promise<string[]>;
}

export async function downloadRemoteImage(
  source: string,
  options: { maxBytes: number; timeoutMs: number },
  dependencies: RemoteImageDependencies = defaultRemoteImageDependencies,
): Promise<ValidatedImage> {
  assertPositiveLimit(options.maxBytes, 'maxBytes');
  assertPositiveLimit(options.timeoutMs, 'timeoutMs');
  if (source.startsWith('data:')) return decodeImageDataUrl(source, options.maxBytes);

  let url = parseAllowedUrl(source);
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), options.timeoutMs);

  try {
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      await raceWithAbort(assertPublicHost(url.hostname, dependencies.resolveHost), abortController.signal);
      const response = await raceWithAbort(dependencies.fetch(url, {
        headers: { Accept: supportedImageTypes.join(',') },
        redirect: 'manual',
        signal: abortController.signal,
      }), abortController.signal);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirect === MAX_REDIRECTS) {
          throw new RemoteImageError('redirect_rejected', 'The image redirect could not be followed.');
        }
        url = parseAllowedUrl(new URL(location, url).toString());
        continue;
      }

      if (!response.ok || !response.body) {
        throw new RemoteImageError('download_failed', 'The image provider request failed.');
      }
      const contentType = requireSupportedImageContentType(response.headers.get('content-type'));
      const declaredLength = parseContentLength(response.headers.get('content-length'));
      if (declaredLength !== undefined && declaredLength > options.maxBytes) {
        throw new AssetValidationError('file_too_large', 'The image exceeds the download limit.');
      }

      const bytes = await raceWithAbort(
        readLimitedBody(response.body, options.maxBytes),
        abortController.signal,
      );
      return validateImageBytes(bytes, {
        claimedContentType: contentType,
        maxBytes: options.maxBytes,
      });
    }
  } catch (error) {
    if (abortController.signal.aborted) {
      throw new RemoteImageError('download_timeout', 'The image download timed out.');
    }
    if (error instanceof RemoteImageError || error instanceof AssetValidationError) throw error;
    throw new RemoteImageError('download_failed', 'The image could not be downloaded.');
  } finally {
    clearTimeout(timeout);
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
  const match = dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/);
  if (!match || match[2].length % 4 !== 0) {
    throw new RemoteImageError('invalid_data_url', 'The image data URL is invalid.');
  }
  const contentType = requireSupportedImageContentType(match[1]);
  const encoded = match[2];
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const decodedLength = (encoded.length / 4) * 3 - padding;
  if (decodedLength > maxBytes) {
    throw new AssetValidationError('file_too_large', 'The image exceeds the download limit.');
  }

  return validateImageBytes(Buffer.from(encoded, 'base64'), {
    claimedContentType: contentType,
    maxBytes,
  });
}

function parseAllowedUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RemoteImageError('invalid_url', 'The image URL is invalid.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new RemoteImageError('invalid_protocol', 'Only HTTP and HTTPS image URLs are allowed.');
  }
  if (url.username || url.password) {
    throw new RemoteImageError('credentials_rejected', 'Credentials in image URLs are not allowed.');
  }
  return url;
}

async function assertPublicHost(
  hostname: string,
  resolveHost: RemoteImageDependencies['resolveHost'],
) {
  const normalizedHostname = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (normalizedHostname === 'localhost' || normalizedHostname.endsWith('.localhost')) {
    throw new RemoteImageError('private_address', 'Private network image URLs are not allowed.');
  }

  let addresses: string[];
  try {
    addresses = isIP(normalizedHostname) ? [normalizedHostname] : await resolveHost(normalizedHostname);
  } catch {
    throw new RemoteImageError('host_unresolved', 'The image host could not be resolved.');
  }
  if (addresses.length === 0) {
    throw new RemoteImageError('host_unresolved', 'The image host could not be resolved.');
  }
  if (addresses.some((address) => !isPublicAddress(address))) {
    throw new RemoteImageError('private_address', 'Private network image URLs are not allowed.');
  }
}

function isPublicAddress(address: string) {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  if (isIP(normalized) === 4) return isPublicIpv4(normalized);
  if (isIP(normalized) !== 6) return false;

  const groups = parseIpv6(normalized);
  if (!groups) return false;
  const first = groups[0];
  const second = groups[1];
  const allLeadingZero = groups.slice(0, 6).every((group) => group === 0);
  const ipv4Mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (allLeadingZero || ipv4Mapped) {
    const embedded = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
    return isPublicIpv4(embedded);
  }

  return (first & 0xfe00) !== 0xfc00
    && (first & 0xffc0) !== 0xfe80
    && (first & 0xffc0) !== 0xfec0
    && (first & 0xff00) !== 0xff00
    && !(first === 0x0064 && second === 0xff9b)
    && !(first === 0x2001 && second === 0x0000)
    && !(first === 0x2001 && second === 0x0db8)
    && first !== 0x2002;
}

function isPublicIpv4(address: string) {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [first, second, third] = octets;
  return first !== 0
    && first !== 10
    && first !== 127
    && !(first === 100 && second >= 64 && second <= 127)
    && !(first === 169 && second === 254)
    && !(first === 172 && second >= 16 && second <= 31)
    && !(first === 192 && second === 0 && third === 0)
    && !(first === 192 && second === 0 && third === 2)
    && !(first === 192 && second === 88 && third === 99)
    && !(first === 192 && second === 168)
    && !(first === 198 && (second === 18 || second === 19))
    && !(first === 198 && second === 51 && third === 100)
    && !(first === 203 && second === 0 && third === 113)
    && first < 224;
}

function parseIpv6(address: string) {
  let value = address;
  const ipv4Match = value.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/);
  if (ipv4Match) {
    const octets = ipv4Match[1].split('.').map(Number);
    if (!isPublicOrPrivateIpv4(octets)) return undefined;
    value = `${value.slice(0, -ipv4Match[1].length)}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }

  const halves = value.split('::');
  if (halves.length > 2) return undefined;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  if (halves.length === 1 && left.length !== 8) return undefined;
  const missing = 8 - left.length - right.length;
  if (missing < (halves.length === 2 ? 1 : 0)) return undefined;
  const groups = [...left, ...Array(missing).fill('0'), ...right].map((group) => Number.parseInt(group, 16));
  return groups.length === 8 && groups.every((group) => Number.isInteger(group) && group >= 0 && group <= 0xffff)
    ? groups
    : undefined;
}

function isPublicOrPrivateIpv4(octets: number[]) {
  return octets.length === 4
    && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
}

function requireSupportedImageContentType(value?: string | null): SupportedImageType {
  const normalized = value?.split(';')[0]?.trim().toLowerCase();
  const supported = supportedImageTypes.find((item) => item === normalized);
  if (!supported) {
    throw new RemoteImageError('unsupported_content_type', 'The provider response is not a supported image type.');
  }
  return supported;
}

function parseContentLength(value: string | null) {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new RemoteImageError('invalid_content_length', 'The provider returned an invalid content length.');
  }
  return parsed;
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

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(new Error('Aborted'));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error('Aborted'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

function assertPositiveLimit(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RemoteImageError('invalid_limit', `${name} must be a positive integer.`);
  }
}

const defaultRemoteImageDependencies: RemoteImageDependencies = {
  fetch: (input, init) => fetch(input, init),
  async resolveHost(hostname) {
    const [ipv4, ipv6] = await Promise.all([
      resolve4(hostname).catch(() => []),
      resolve6(hostname).catch(() => []),
    ]);
    return [...ipv4, ...ipv6];
  },
};
