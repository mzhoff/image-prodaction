const ALLOWED_CAPTION_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'code', 'pre',
  'a', 'tg-spoiler', 'blockquote',
]);

export function sanitizeTelegramHtml(value: string) {
  return value.replace(/<br\s*\/?\s*>/gi, '\n');
}

export function toPlainTextFromTelegramHtml(value: string) {
  return value.replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

export function isCaptionFallbackError(error: unknown) {
  const message = (typeof error === 'string' ? error : error instanceof Error ? error.message : '')
    .toLowerCase();
  return [
    'caption is too long', 'message caption is too long', 'message is too long',
    "can't parse entities", 'unsupported start tag', 'unsupported end tag',
    "can't parse text entities", "can't parse input",
  ].some((fragment) => message.includes(fragment));
}

export function sanitizeTelegramCaptionHtml(value: string) {
  return value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, (tag) => {
    const match = tag.match(/^<\/?\s*([a-zA-Z0-9-]+)([^>]*)>/);
    if (!match) return '';
    const isClosing = /^<\//.test(tag);
    const tagName = match[1]?.toLowerCase() ?? '';
    if (!ALLOWED_CAPTION_TAGS.has(tagName)) return '';
    if (tagName !== 'a') return isClosing ? `</${tagName}>` : `<${tagName}>`;
    if (isClosing) return '</a>';
    const hrefMatch = (match[2] ?? '').match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (!hrefMatch) return '';
    const rawHref = (hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] ?? '').trim();
    if (!rawHref) return '';
    let href = rawHref;
    try { href = decodeURIComponent(rawHref); } catch { href = rawHref; }
    if (!href || /^\s*javascript:/i.test(href)) return '';
    return `<a href="${escapeAttribute(href)}">`;
  });
}

export function splitByLimit(value: string, limit: number) {
  if (!value) return [];
  const parts: string[] = [];
  for (let index = 0; index < value.length; index += limit) parts.push(value.slice(index, index + limit));
  return parts;
}

export function addAlbumCaption(
  media: File[],
  caption: string | null,
  hasParseMode: boolean,
): Array<Record<string, string>> {
  return media.map((_file, index) => ({
    type: 'photo',
    media: `attach://media_${index}`,
    ...(index === 0 && caption ? {
      caption,
      ...(hasParseMode ? { parse_mode: 'HTML' } : {}),
    } : {}),
  }));
}

function escapeAttribute(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
