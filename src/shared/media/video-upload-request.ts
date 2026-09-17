import { readBoundedAudioStream } from './audio-upload-request';
import { MAX_VIDEO_BYTES, VideoProcessingError } from './video-contracts';

let activeUploads = 0;
/** One bounded video upload per process; multipart parsing currently materializes the body. */
export async function withVideoUploadLimit<T>(work: () => Promise<T>): Promise<T> {
  if (activeUploads >= 1) throw new VideoProcessingError('video_upload_busy', 'A video upload is already in progress. Retry shortly.', 429);
  activeUploads += 1;
  try { return await work(); } finally { activeUploads -= 1; }
}

export async function readVideoMultipart(request: Request, allowedFields: readonly string[]) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!/^multipart\/form-data\s*;/i.test(contentType)) throw new VideoProcessingError('invalid_content_type', 'A multipart file upload is required.', 415);
  const maximum = MAX_VIDEO_BYTES + 1024 * 1024;
  if (Number(request.headers.get('content-length')) > maximum) throw new VideoProcessingError('file_too_large', 'The video upload exceeds 100 MiB.', 413);
  if (!request.body) throw new VideoProcessingError('missing_file', 'A video file is required.', 400);
  const bytes = await readBoundedAudioStream(request.body, maximum, request.signal);
  let form: FormData;
  try { form = await new Response(bytes as BodyInit, { headers: { 'Content-Type': contentType } }).formData(); }
  catch { throw new VideoProcessingError('invalid_multipart', 'The multipart upload is invalid.', 400); }
  for (const key of form.keys()) {
    if (!allowedFields.includes(key) || form.getAll(key).length !== 1) throw new VideoProcessingError('invalid_upload_field', 'The upload contains an unsupported or duplicate field.', 400);
  }
  const file = form.get('file');
  if (!(file instanceof File)) throw new VideoProcessingError('missing_file', 'A video file is required.', 400);
  if (!file.size || file.size > MAX_VIDEO_BYTES) throw new VideoProcessingError('file_too_large', 'Video must be nonempty and at most 100 MiB.', 413);
  return { file, form };
}
