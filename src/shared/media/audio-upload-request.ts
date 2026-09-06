import { AudioProcessingError, MAX_AUDIO_BYTES } from './audio-contracts';

let activeUploads = 0;
/** Bound multipart memory before reading the body, independently of decoder concurrency. */
export async function withAudioUploadLimit<T>(work: () => Promise<T>): Promise<T> {
  if (activeUploads >= 2) throw new AudioProcessingError('audio_upload_busy', 'Two audio uploads are already in progress. Retry shortly.', 429);
  activeUploads += 1;
  try { return await work(); } finally { activeUploads -= 1; }
}

export async function readBoundedAudioStream(body: ReadableStream<Uint8Array>, maximum = MAX_AUDIO_BYTES, signal?: AbortSignal) {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let failure: unknown;
  const cancel = (reason: unknown) => { failure = reason; void reader.cancel(reason).catch(() => undefined); };
  const abort = () => cancel(signal?.reason ?? new AudioProcessingError('audio_canceled', 'Audio upload was canceled.', 499));
  const timeout = setTimeout(() => cancel(new AudioProcessingError('audio_upload_timeout', 'Audio upload timed out.', 408)), 120_000);
  timeout.unref();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    signal?.throwIfAborted();
    while (true) {
      const chunk = await reader.read();
      if (failure) throw failure;
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new AudioProcessingError('file_too_large', 'The audio upload exceeds the limit.', 413);
      }
      chunks.push(chunk.value);
    }
    return new Uint8Array(Buffer.concat(chunks, size));
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); reader.releaseLock(); }
}

export async function readAudioMultipart(request: Request, allowedFields: readonly string[]) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!/^multipart\/form-data\s*;/i.test(contentType)) throw new AudioProcessingError('invalid_content_type', 'A multipart file upload is required.', 415);
  const maximum = MAX_AUDIO_BYTES + 1024 * 1024;
  if (Number(request.headers.get('content-length')) > maximum) throw new AudioProcessingError('file_too_large', 'The audio upload exceeds the limit.', 413);
  if (!request.body) throw new AudioProcessingError('missing_file', 'An audio file is required.', 400);
  const bytes = await readBoundedAudioStream(request.body, maximum, request.signal);
  let form: FormData;
  try { form = await new Response(bytes as BodyInit, { headers: { 'Content-Type': contentType } }).formData(); }
  catch { throw new AudioProcessingError('invalid_multipart', 'The multipart upload is invalid.', 400); }
  for (const key of form.keys()) {
    if (!allowedFields.includes(key) || form.getAll(key).length !== 1) throw new AudioProcessingError('invalid_upload_field', 'The upload contains an unsupported or duplicate field.', 400);
  }
  const file = form.get('file');
  if (!(file instanceof File)) throw new AudioProcessingError('missing_file', 'An audio file is required.', 400);
  if (!file.size || file.size > MAX_AUDIO_BYTES) throw new AudioProcessingError('file_too_large', 'Audio must be nonempty and at most 50 MiB.', 413);
  return { file, form };
}
