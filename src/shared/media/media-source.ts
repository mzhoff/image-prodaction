import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, statfs, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { AudioProcessingError } from './audio-contracts';

import type { MediaFile, MediaSource } from './media-source-contracts';
export type { MediaFile, MediaSource } from './media-source-contracts';
export const mediaHeader = (source: MediaSource) => source instanceof Uint8Array ? source : source.header;
export const mediaChecksum = (source: MediaSource) => source instanceof Uint8Array ? createHash('sha256').update(source).digest('hex') : source.checksumSha256;
export const mediaBody = (source: MediaSource) => source instanceof Uint8Array ? source : createReadStream(source.path);
export async function mediaPath(source: MediaSource, target: string) {
  if (!(source instanceof Uint8Array)) return source.path;
  await writeFile(target, source, { mode: 0o600 }); return target;
}

let reserved = 0;
const MAX_TEMP_BYTES = 4 * 1024 ** 3;
/** Reserve capacity before reading, including requests without Content-Length. */
export async function createMediaWorkspace(reserveBytes: number) {
  if (!Number.isSafeInteger(reserveBytes) || reserveBytes < 1 || reserved + reserveBytes > MAX_TEMP_BYTES) throw new AudioProcessingError('media_busy', 'Загрузка занята. Повторите чуть позже.', 503);
  reserved += reserveBytes;
  let directory: string;
  try {
    const disk = await statfs(tmpdir());
    if (disk.bavail * disk.bsize < reserved + 2 * 1024 ** 3) throw new AudioProcessingError('media_disk_full', 'Недостаточно временного места для обработки.', 503);
    directory = await mkdtemp(join(tmpdir(), 'image-production-media-'));
  } catch (error) { reserved -= reserveBytes; throw error; }
  let closed = false;
  return { directory, async dispose() {
    if (closed) return; closed = true;
    try { await rm(directory, { recursive: true, force: true }); } finally { reserved -= reserveBytes; }
  } };
}

/** Backpressure and a fixed-size header keep memory independent of source size. */
export async function streamMediaFile(body: ReadableStream | Readable, path: string, maxBytes: number, signal?: AbortSignal): Promise<MediaFile> {
  const hash = createHash('sha256'); let byteLength = 0; let header = Buffer.alloc(0);
  const meter = new Transform({ transform(chunk: Buffer, _encoding, done) {
    byteLength += chunk.length;
    if (byteLength > maxBytes) { done(new AudioProcessingError('file_too_large', 'Файл превышает лимит загрузки.', 413)); return; }
    hash.update(chunk);
    if (header.length < 4096) header = Buffer.concat([header, chunk.subarray(0, 4096 - header.length)]);
    done(null, chunk);
  } });
  await pipeline(body instanceof Readable ? body : Readable.fromWeb(body as import('node:stream/web').ReadableStream), meter, createWriteStream(path, { flags: 'wx', mode: 0o600 }), { signal });
  if (!byteLength) throw new AudioProcessingError('empty_file', 'Файл пуст.', 400);
  return { path, byteLength, header, checksumSha256: hash.digest('hex') };
}
