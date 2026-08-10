import { z } from 'zod';
import { normalizeChatId, TELEGRAM_MAX_MEDIA_ITEMS } from './telegram-bot';
import {
  sanitizeTelegramCaptionHtml,
  sanitizeTelegramHtml,
  toPlainTextFromTelegramHtml,
} from './telegram-caption';
import { sendTelegramPost } from './telegram-post-sender';

export const runtime = 'nodejs';

const requestSchema = z.object({
  channel: z.string().min(1),
  contentHtml: z.string(),
  disableWebPagePreview: z.preprocess(
    (value) => value === null ? undefined : value,
    z.string().transform((value) => value === 'true').optional(),
  ),
});

export async function POST(request: Request) {
  const formData = await request.formData();
  const parsed = requestSchema.safeParse({
    channel: formData.get('channel'),
    contentHtml: formData.get('contentHtml') ?? '',
    disableWebPagePreview: formData.get('disableWebPagePreview'),
  });
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const contentHtml = parsed.data.contentHtml.trim()
    ? sanitizeTelegramHtml(parsed.data.contentHtml.trim())
    : '';
  const media = formData.getAll('media')
    .filter((item): item is File => item instanceof File && item.size > 0);
  if (media.length === 0 && !contentHtml.trim()) {
    return Response.json({ error: 'Message text is required when no media is attached.' }, { status: 400 });
  }
  if (media.length > TELEGRAM_MAX_MEDIA_ITEMS) {
    return Response.json({
      error: `Too many media files. Maximum is ${TELEGRAM_MAX_MEDIA_ITEMS}.`,
    }, { status: 400 });
  }
  try {
    return Response.json(await sendTelegramPost({
      channel: normalizeChatId(parsed.data.channel),
      contentHtml,
      disableWebPagePreview: Boolean(parsed.data.disableWebPagePreview),
      formattedCaption: contentHtml ? sanitizeTelegramCaptionHtml(contentHtml) : '',
      media,
      plainCaption: contentHtml ? toPlainTextFromTelegramHtml(contentHtml) : '',
    }));
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'Telegram send failed',
    }, { status: 400 });
  }
}
