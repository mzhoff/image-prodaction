import busboy from 'busboy';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { AudioProcessingError } from './audio-contracts';
import { createMediaWorkspace, streamMediaFile, type MediaFile } from './media-source';

export interface StreamingUpload { file: MediaFile & { name: string; type: string }; form: FormData }
export interface StreamingMultipart { files: StreamingUpload['file'][]; form: FormData }
const invalid = () => new AudioProcessingError('invalid_multipart', 'Недопустимые поля загрузки.', 400);
let active = 0;

/** Same HTTP form contract for canvas, Library, references and Runtime callers. */
export async function withStreamingUpload<T>(request: Request, maxBytes: number, fields: string[], work: (upload: StreamingUpload) => Promise<T>): Promise<T> {
  return withStreamingMultipart(request, { maxBytes, fields }, async ({ files, form }) => {
    if (files.length !== 1) throw invalid();
    return work({ file: files[0], form });
  });
}
export async function withStreamingMultipart<T>(request: Request, options: { maxBytes: number; fields: string[]; fileField?: string; maxFiles?: number; fieldBytes?: number }, work: (upload: StreamingMultipart) => Promise<T>): Promise<T> {
  const { maxBytes, fields, fileField = 'file', maxFiles = 1, fieldBytes = 128 } = options;
  if (!request.body) throw invalid();
  if (active >= 4) throw new AudioProcessingError('media_busy', 'Загрузка занята. Повторите чуть позже.', 503);
  if (Number(request.headers.get('content-length')) > maxBytes + 1024 * 1024) throw new AudioProcessingError('file_too_large', 'Файл превышает лимит загрузки.', 413);
  active++;
  let workspace: Awaited<ReturnType<typeof createMediaWorkspace>> | undefined;
  const controller = new AbortController();
  const signal = AbortSignal.any([request.signal, controller.signal, AbortSignal.timeout(30 * 60_000)]);
  const writes: Promise<void>[] = [];
  let parsed = false;
  try {
    let parser: ReturnType<typeof busboy>;
    try { parser = busboy({ headers: Object.fromEntries(request.headers), limits: { fileSize: maxBytes + 1, files: maxFiles, fields: fields.length - 1, parts: fields.length + maxFiles, fieldSize: fieldBytes, headerPairs: 32 } }); }
    catch { throw invalid(); }
    workspace = await createMediaWorkspace(maxBytes);
    const form = new FormData(); const files: StreamingUpload['file'][] = []; let fileCount = 0;
    const fail = (error: unknown) => { if (!controller.signal.aborted) controller.abort(error); };
    parser.on('field', (name, value, info) => {
      if (!fields.includes(name) || name === fileField || form.has(name) || info.nameTruncated || info.valueTruncated) { fail(invalid()); return; }
      form.set(name, value);
    });
    parser.on('file', (name, stream, info) => {
      if (name !== fileField || fileCount >= maxFiles) { stream.resume(); fail(invalid()); return; }
      const index = fileCount++;
      stream.on('limit', () => fail(new AudioProcessingError('file_too_large', 'Файл превышает лимит загрузки.', 413)));
      const write = streamMediaFile(stream, join(workspace!.directory, `upload-${index}`), maxBytes, signal)
        .then((source) => { files[index] = { ...source, name: info.filename.slice(0, 255), type: info.mimeType }; })
        .catch(fail);
      writes.push(write);
    });
    for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit'] as const) parser.on(event, () => fail(invalid()));
    let size = 0;
    const meter = new Transform({ transform(chunk: Buffer, _encoding, done) {
      size += chunk.length;
      done(size > maxBytes + 1024 * 1024 ? new AudioProcessingError('file_too_large', 'Файл превышает лимит загрузки.', 413) : null, chunk);
    } });
    await pipeline(Readable.fromWeb(request.body as import('node:stream/web').ReadableStream), meter, parser, { signal });
    await Promise.all(writes); signal.throwIfAborted();
    if (files.reduce((sum, file) => sum + file.byteLength, 0) > maxBytes) throw new AudioProcessingError('file_too_large', 'Файлы превышают суммарный лимит загрузки.', 413);
    parsed = true;
    return await work({ files, form });
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (parsed || request.signal.aborted || error instanceof AudioProcessingError) throw error;
    throw invalid();
  } finally {
    controller.abort(); await Promise.allSettled(writes);
    try { await workspace?.dispose(); } finally { active--; }
  }
}
