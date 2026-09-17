// Local HTTP transport ceiling, not an OpenRouter-wide provider guarantee.
export const IMAGE_GENERATION_REQUEST_MAX_BYTES = 30 * 1024 * 1024;

// Google AI Studio inline requests: complete serialized request, not raw image bytes.
// https://ai.google.dev/gemini-api/docs/image-understanding (checked 2026-09-07).
// OpenRouter currently routes Nano Banana 2 to Google AI Studio. Other routes
// may have different limits; do not reuse Cloud Storage / Files API limits here.
export const GEMINI_INLINE_REQUEST_MAX_BYTES = 20_000_000;

export function getGeminiInlineRequestSizeError(model: string, body: string): string | null {
  if (!model.startsWith('google/gemini-') || !body.includes('"url":"data:image/')) return null;
  const bytes = new TextEncoder().encode(body).byteLength;
  if (bytes <= GEMINI_INLINE_REQUEST_MAX_BYTES) return null;
  return `Запрос к Gemini с референсами занимает ${(bytes / 1_000_000).toFixed(1)} МБ. Для встроенных изображений Google AI Studio допускает до 20 МБ на весь запрос, включая текст и base64. Уменьшите размер или число референсов. Запрос не отправлен в модель.`;
}
