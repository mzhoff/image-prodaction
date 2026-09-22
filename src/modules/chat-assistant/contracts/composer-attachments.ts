import { DEFAULT_MANAGED_ATTACHMENT_MIME_TYPES } from '@prodactionpro/chat-domain';

export const CHAT_MEDIA_MIME_TYPES = [
  'video/mp4', 'video/quicktime', 'video/webm',
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a',
  'audio/ogg', 'audio/opus', 'audio/aac', 'audio/flac', 'audio/x-flac',
] as const;
export const CHAT_COMPOSER_MIME_TYPES = [...DEFAULT_MANAGED_ATTACHMENT_MIME_TYPES, ...CHAT_MEDIA_MIME_TYPES];
export const CHAT_TEXT_MAX_CHARACTERS = 20_000;
export const CHAT_ATTACHMENT_HINT = 'До 3 файлов · до 8 МБ каждый · JPG, PNG, WebP, HEIC, TXT, MD, CSV, JSON, видео и аудио';
export const CHAT_MEDIA_ANALYSIS_NOTICE = 'Видео и аудио прикреплены как материалы. Соавтор видит имя файла; содержимое и речь ещё не проанализированы.';
