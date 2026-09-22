import { openAsBlob } from 'node:fs';
import { withStreamingMultipart } from '@/shared/media/streaming-upload';
import { AuthenticationRequiredError, requireApiSession } from '@/modules/authentication/server/auth-session';
import { readAuthServerConfig } from '@/shared/auth/config';
import { AudioProcessingError } from '@/shared/media/audio-contracts';
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
  try {
  if (!readAuthServerConfig().trustedOrigins.includes(request.headers.get('origin') ?? '')) return Response.json({ error: 'Invalid origin' }, { status: 403 });
  await requireApiSession(request);
  return await withStreamingMultipart(request, { maxBytes: 100 * 1024 * 1024, maxFiles: TELEGRAM_MAX_MEDIA_ITEMS,
    fileField: 'media', fields: ['media', 'channel', 'contentHtml', 'disableWebPagePreview'], fieldBytes: 64 * 1024 }, async ({ files, form: formData }) => {
  const parsed = requestSchema.safeParse({
    channel: formData.get('channel'),
    contentHtml: formData.get('contentHtml') ?? '',
    disableWebPagePreview: formData.get('disableWebPagePreview'),
  });
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  const contentHtml = parsed.data.contentHtml.trim()
    ? sanitizeTelegramHtml(parsed.data.contentHtml.trim())
    : '';
  const media = await Promise.all(files.map(async (file) => new File([await openAsBlob(file.path, { type: file.type })], file.name, { type: file.type })));
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
  });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Upload failed' }, { status: error instanceof AuthenticationRequiredError ? 401 : error instanceof AudioProcessingError ? error.status : 400 }); }
}
