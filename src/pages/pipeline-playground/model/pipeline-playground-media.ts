import type { PipelineValueKind, PipelineArtifactReference } from '@/modules/executable-pipelines/contracts/pipeline-contracts';
import { MAX_AUDIO_BYTES } from '@/shared/media/audio-contracts';
import { MAX_VIDEO_BYTES } from '@/shared/media/video-contracts';

export const PLAYGROUND_MEDIA = {
  image: { label: 'Изображение', action: 'Добавить изображение', accept: '.jpg,.jpeg,.png,.webp,.gif,.heic,.heif',
    hint: 'JPG, PNG, WebP, GIF или HEIC', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'],
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'], maxBytes: null },
  video: { label: 'Видео', action: 'Добавить видео', accept: '.mp4,.mov,.webm',
    hint: 'MP4, MOV или WebM · до 1 ГБ и 30 минут', extensions: ['mp4', 'mov', 'webm'],
    mimeTypes: ['video/mp4', 'video/quicktime', 'video/webm'], maxBytes: MAX_VIDEO_BYTES },
  audio: { label: 'Аудио', action: 'Добавить аудио', accept: '.mp3,.wav,.m4a,.aac,.ogg,.flac',
    hint: 'MP3, WAV, M4A, AAC, OGG или FLAC · до 50 МБ и 30 минут', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'],
    mimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/flac', 'audio/x-flac'], maxBytes: MAX_AUDIO_BYTES },
} satisfies Record<PipelineArtifactReference['kind'], { label: string; action: string; accept: string; hint: string; extensions: string[]; mimeTypes: string[]; maxBytes: number | null }>;

export function playgroundMediaKind(kind: PipelineValueKind) {
  return kind === 'image_collection' ? 'image' : kind === 'image' || kind === 'audio' || kind === 'video' ? kind : null;
}

/** Fast feedback only. Durable ingest still validates signatures, codecs, dimensions and duration. */
export function validatePlaygroundFiles(kind: PipelineValueKind, files: Pick<File, 'name' | 'type' | 'size'>[]) {
  const mediaKind = playgroundMediaKind(kind);
  if (!mediaKind) return 'Этот вход не принимает файлы.';
  if (kind !== 'image_collection' && files.length > 1) return 'Для этого входа нужен один файл.';
  const policy = PLAYGROUND_MEDIA[mediaKind];
  for (const file of files) {
    if (file.size === 0) return `Файл «${file.name}» пуст.`;
    const mime = file.type.toLowerCase();
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!(policy.extensions as string[]).includes(extension)
      || (mime && mime !== 'application/octet-stream' && !(policy.mimeTypes as string[]).includes(mime))) {
      return `«${file.name}» не подходит. ${policy.hint}.`;
    }
    if (policy.maxBytes !== null && file.size > policy.maxBytes) return `«${file.name}» слишком большой. ${policy.hint}.`;
  }
  return null;
}
