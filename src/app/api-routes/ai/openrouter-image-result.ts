export interface OpenRouterImageMessage {
  content?: unknown;
  images?: Array<{
    type?: string;
    image_url?: {
      url?: string;
    };
  }>;
}

const inlineImageUrlPattern = /(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+|https?:\/\/[^\s)"']+)/;

export function extractOpenRouterImageUrl(message?: OpenRouterImageMessage) {
  const imageUrl = message?.images?.find((image) => image.image_url?.url)?.image_url?.url;
  if (imageUrl) return imageUrl;

  const content = typeof message?.content === 'string' ? message.content : '';
  return content.match(inlineImageUrlPattern)?.[1] ?? null;
}

export function extractOpenRouterMessageText(message?: OpenRouterImageMessage) {
  return typeof message?.content === 'string' ? message.content : '';
}

export function summarizeOpenRouterImageMessage(message?: OpenRouterImageMessage) {
  const content = extractOpenRouterMessageText(message);
  return {
    contentLength: content.length,
    contentType: typeof message?.content,
    hasImage: Boolean(extractOpenRouterImageUrl(message)),
    imageCount: message?.images?.length ?? 0,
  };
}

export function missingOpenRouterImageError(action: string) {
  return `${action}: OpenRouter ответил без изображения. HTTP-запрос завершился, но в ответе не было image payload для сохранения в ноду.`;
}

export function missingOpenRouterImageErrorWithContext(action: string, message?: OpenRouterImageMessage) {
  const text = extractOpenRouterMessageText(message).trim();
  if (!text) return missingOpenRouterImageError(action);
  return `${missingOpenRouterImageError(action)} Ответ модели: ${text.slice(0, 500)}`;
}

export async function normalizeOpenRouterImageUrl(url: string) {
  if (url.startsWith('data:')) return url;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`OpenRouter image download failed: ${response.status}`);
  const contentType = response.headers.get('content-type') ?? 'image/png';
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}
