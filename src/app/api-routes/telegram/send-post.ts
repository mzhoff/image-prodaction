import { z } from 'zod';
import {
  callTelegramFormData,
  buildTelegramSendPostLink,
  callTelegramJson,
  normalizeChatId,
  TELEGRAM_MAX_MEDIA_ITEMS,
  type TelegramSendPostResponse,
} from './telegram-bot';
import {
  TELEGRAM_MEDIA_CAPTION_LIMIT,
  TELEGRAM_TEXT_MESSAGE_LIMIT,
} from '@/shared/lib/telegram-limits';

export const runtime = 'nodejs';
const TELEGRAM_ALLOWED_MEDIA_CAPTION_TAGS = new Set([
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'strike',
  'del',
  'code',
  'pre',
  'a',
  'tg-spoiler',
  'blockquote',
]);

function sanitizeTelegramHtml(value: string) {
  return value.replace(/<br\s*\/?\s*>/gi, '\n');
}

function toPlainTextFromTelegramHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function isCaptionTooLongError(error: unknown) {
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
  const normalized = message.toLowerCase();
  return (
    normalized.includes('caption is too long') ||
    normalized.includes('message caption is too long') ||
    normalized.includes('message is too long')
  );
}

function isTelegramHtmlParseError(error: unknown) {
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
  const normalized = message.toLowerCase();

  return (
    normalized.includes("can't parse entities") ||
    normalized.includes('unsupported start tag') ||
    normalized.includes('unsupported end tag') ||
    normalized.includes("can't parse text entities") ||
    normalized.includes("can't parse input")
  );
}

function escapeTelegramCaptionAttribute(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sanitizeTelegramCaptionHtml(value: string) {
  const withLineBreaks = value.replace(/<br\s*\/?>/gi, '\n');

  return withLineBreaks.replace(/<[^>]+>/g, (tag) => {
    const match = tag.match(/^<\/?\s*([a-zA-Z0-9-]+)([^>]*)>/);
    if (!match) return '';

    const isClosing = /^<\//.test(tag);
    const tagName = match[1]?.toLowerCase() ?? '';
    const attributes = match[2] ?? '';

    if (!TELEGRAM_ALLOWED_MEDIA_CAPTION_TAGS.has(tagName)) return '';

    if (tagName === 'a') {
      if (isClosing) return '</a>';
      const hrefMatch = attributes.match(/href\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s>]+))/i);
      if (!hrefMatch) return '';

      const rawHref = (hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] ?? '').trim();
      if (!rawHref) return '';

      let href = rawHref;
      try {
        href = decodeURIComponent(rawHref);
      } catch {
        href = rawHref;
      }

      if (!href) return '';
      if (/^\s*javascript:/i.test(href)) return '';
      return `<a href="${escapeTelegramCaptionAttribute(href)}">`;
    }

    return isClosing ? `</${tagName}>` : `<${tagName}>`;
  });
}

function splitByLimit(value: string, limit: number) {
  if (!value) return [];
  const parts: string[] = [];
  for (let index = 0; index < value.length; index += limit) {
    parts.push(value.slice(index, index + limit));
  }
  return parts;
}

function addAlbumCaption(
  media: File[],
  caption: string | null,
  hasParseMode: boolean,
): Array<Record<string, string>> {
  return media.map((_file, index) => {
    const mediaItem: Record<string, string> = {
      type: 'photo',
      media: `attach://media_${index}`,
    };

    if (index === 0 && caption) {
      mediaItem.caption = caption;
      if (hasParseMode) {
        mediaItem.parse_mode = 'HTML';
      }
    }

    return mediaItem;
  });
}

const textFileValidationSchema = z.object({
  channel: z.string().min(1),
  contentHtml: z.string(),
  disableWebPagePreview: z.preprocess(
    (value) => (value === null ? undefined : value),
    z
      .string()
      .transform((value) => value === 'true')
      .optional(),
  ),
});

async function sendTextMessage(
  channel: string,
  text: string,
  disableWebPagePreview: boolean,
  parseMode?: 'HTML',
) {
  if (!text) return null;

  const response = await callTelegramJson<{ message_id?: number; date?: number }>('sendMessage', {
    chat_id: channel,
    text,
    ...(parseMode ? { parse_mode: parseMode } : {}),
    disable_web_page_preview: disableWebPagePreview,
  });

  return response.result;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const raw = {
    channel: formData.get('channel'),
    contentHtml: formData.get('contentHtml') ?? '',
    disableWebPagePreview: formData.get('disableWebPagePreview'),
  };

  const parsed = textFileValidationSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const channel = normalizeChatId(parsed.data.channel);
  const contentHtml = parsed.data.contentHtml?.trim?.() ? sanitizeTelegramHtml(parsed.data.contentHtml.trim()) : '';
  const media = formData.getAll('media').filter((item): item is File => item instanceof File && item.size > 0);
  const disableWebPagePreview = Boolean(parsed.data.disableWebPagePreview);
  const formattedCaption = contentHtml ? sanitizeTelegramCaptionHtml(contentHtml) : '';
  const plainCaption = contentHtml ? toPlainTextFromTelegramHtml(contentHtml) : '';

  if (media.length === 0 && !contentHtml.trim()) {
    return Response.json({ error: 'Message text is required when no media is attached.' }, { status: 400 });
  }

  if (media.length > TELEGRAM_MAX_MEDIA_ITEMS) {
    return Response.json({ error: `Too many media files. Maximum is ${TELEGRAM_MAX_MEDIA_ITEMS}.` }, { status: 400 });
  }

  try {
    let messageResult;
    if (media.length === 0) {
      const message = contentHtml;
      try {
        messageResult = await callTelegramJson<{ message_id?: number; date?: number }>('sendMessage', {
          chat_id: channel,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: disableWebPagePreview,
        });
      } catch (error) {
        if (!isTelegramHtmlParseError(error) && !isCaptionTooLongError(error)) throw error;

        const fallbackParts = splitByLimit(toPlainTextFromTelegramHtml(contentHtml), TELEGRAM_TEXT_MESSAGE_LIMIT);
        const fallbackResult = await Promise.all(
          fallbackParts.map((chunk) => sendTextMessage(channel, chunk, disableWebPagePreview)),
        );
        const messageIds = fallbackResult.map((item) => item?.message_id).filter((messageId): messageId is number => typeof messageId === 'number');

        const payload: TelegramSendPostResponse = {
          messageIds,
          chatId: channel,
          date: fallbackResult?.[0]?.date ?? null,
          postUrl: buildTelegramSendPostLink(channel, messageIds[0]),
        };

        return Response.json(payload);
      }

      if (!messageResult.result) throw new Error('Telegram did not return a message.');

      const messageIds = messageResult.result.message_id ? [messageResult.result.message_id] : [];
      const payload: TelegramSendPostResponse = {
        messageIds,
        chatId: channel,
        date: messageResult.result.date ?? null,
        postUrl: buildTelegramSendPostLink(channel, messageIds[0]),
      };

      return Response.json(payload);
    }

    if (media.length === 1) {
      const telegramForm = new FormData();
      telegramForm.append('chat_id', channel);
      telegramForm.append('photo', media[0], media[0].name || 'image');
      if (formattedCaption) {
        telegramForm.append('caption', formattedCaption);
        telegramForm.append('parse_mode', 'HTML');
      }
      if (disableWebPagePreview) telegramForm.append('disable_web_page_preview', 'true');

      try {
        messageResult = await callTelegramFormData<{ message_id?: number; date?: number }>('sendPhoto', telegramForm);
      } catch (error) {
        if (!contentHtml || (!isCaptionTooLongError(error) && !isTelegramHtmlParseError(error))) {
          throw error;
        }

        const captionText = plainCaption;
        const firstCaption = captionText.slice(0, TELEGRAM_MEDIA_CAPTION_LIMIT);
        const remainder = captionText.slice(TELEGRAM_MEDIA_CAPTION_LIMIT);

        const fallbackForm = new FormData();
        fallbackForm.append('chat_id', channel);
        fallbackForm.append('photo', media[0], media[0].name || 'image');
        if (firstCaption) fallbackForm.append('caption', firstCaption);
        if (disableWebPagePreview) fallbackForm.append('disable_web_page_preview', 'true');

        messageResult = await callTelegramFormData<{ message_id?: number; date?: number }>('sendPhoto', fallbackForm);
        const messageIds = messageResult.result?.message_id ? [messageResult.result.message_id] : [];
        const followUpResults = await Promise.all(
          splitByLimit(remainder, TELEGRAM_TEXT_MESSAGE_LIMIT).map((chunk) =>
            sendTextMessage(channel, chunk, disableWebPagePreview),
          ),
        );
        for (const followUp of followUpResults) {
          if (followUp?.message_id) messageIds.push(followUp.message_id);
        }

        const payload: TelegramSendPostResponse = {
          messageIds,
          chatId: channel,
          date: messageResult.result?.date ?? null,
          postUrl: buildTelegramSendPostLink(channel, messageIds[0]),
        };
        return Response.json(payload);
      }

      const messageIds = messageResult.result?.message_id ? [messageResult.result.message_id] : [];
      const payload: TelegramSendPostResponse = {
        messageIds,
        chatId: channel,
        date: messageResult.result?.date ?? null,
        postUrl: buildTelegramSendPostLink(channel, messageIds[0]),
      };

      return Response.json(payload);
    }

    const mediaPayload = addAlbumCaption(media, formattedCaption, true);
    const telegramForm = new FormData();
    telegramForm.append('chat_id', channel);
    telegramForm.append('media', JSON.stringify(mediaPayload));
    media.forEach((file, index) => telegramForm.append(`media_${index}`, file, file.name || `image-${index}`));

    let mediaCaptionWasSplit = false;
    try {
      messageResult = await callTelegramFormData<Array<{ message_id?: number; date?: number }>>(
        'sendMediaGroup',
        telegramForm,
      );
    } catch (error) {
      if (!contentHtml || (!isCaptionTooLongError(error) && !isTelegramHtmlParseError(error))) {
        throw error;
      }

      const fallbackCaption = plainCaption.slice(0, TELEGRAM_MEDIA_CAPTION_LIMIT);
      const hasMoreText = plainCaption.length > TELEGRAM_MEDIA_CAPTION_LIMIT;
      const fallbackPayload = addAlbumCaption(media, fallbackCaption, false);
      const fallbackForm = new FormData();
      fallbackForm.append('chat_id', channel);
      fallbackForm.append('media', JSON.stringify(fallbackPayload));
      media.forEach((file, index) => fallbackForm.append(`media_${index}`, file, file.name || `image-${index}`));

      messageResult = await callTelegramFormData<Array<{ message_id?: number; date?: number }>>(
        'sendMediaGroup',
        fallbackForm,
      );
      mediaCaptionWasSplit = hasMoreText;
    }

    const firstMessageDate = messageResult.result?.[0]?.date ?? null;
    const messageIds = (messageResult.result ?? [])
      .map((item) => item.message_id)
      .filter((messageId): messageId is number => typeof messageId === 'number');

    if (mediaCaptionWasSplit && plainCaption) {
      const followUpResults = await Promise.all(
        splitByLimit(plainCaption.slice(TELEGRAM_MEDIA_CAPTION_LIMIT), TELEGRAM_TEXT_MESSAGE_LIMIT).map((chunk) =>
          sendTextMessage(channel, chunk, disableWebPagePreview),
        ),
      );
      for (const followUp of followUpResults) {
        if (followUp?.message_id) messageIds.push(followUp.message_id);
      }
    }

    const payload: TelegramSendPostResponse = {
      messageIds,
      chatId: channel,
      date: firstMessageDate,
      postUrl: buildTelegramSendPostLink(channel, messageIds[0]),
    };

    return Response.json(payload);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Telegram send failed' }, { status: 400 });
  }
}
