export const TELEGRAM_TEXT_MESSAGE_LIMIT = 4096;
export const TELEGRAM_MEDIA_CAPTION_LIMIT = 1024;

export function getTelegramMessageCharacterLimit(hasMedia: boolean) {
  return hasMedia ? TELEGRAM_MEDIA_CAPTION_LIMIT : TELEGRAM_TEXT_MESSAGE_LIMIT;
}

export function getTelegramTextLength(value: string) {
  return (value ?? '').length;
}
