import {
  callTelegramFormData,
  buildTelegramSendPostLink,
  callTelegramJson,
  type TelegramSendPostResponse,
} from './telegram-bot';
import {
  addAlbumCaption,
  isCaptionFallbackError,
  splitByLimit,
} from './telegram-caption';
import {
  TELEGRAM_MEDIA_CAPTION_LIMIT,
  TELEGRAM_TEXT_MESSAGE_LIMIT,
} from '@/shared/lib/telegram-limits';

interface SendPostInput {
  channel: string;
  contentHtml: string;
  disableWebPagePreview: boolean;
  formattedCaption: string;
  media: File[];
  plainCaption: string;
}

type MessageResult = { message_id?: number; date?: number };

export async function sendTelegramPost(input: SendPostInput): Promise<TelegramSendPostResponse> {
  if (input.media.length === 0) return sendTextPost(input);
  if (input.media.length === 1) return sendSinglePhoto(input);
  return sendAlbum(input);
}

async function sendTextPost(input: SendPostInput) {
  try {
    const response = await callTelegramJson<MessageResult>('sendMessage', {
      chat_id: input.channel,
      text: input.contentHtml,
      parse_mode: 'HTML',
      disable_web_page_preview: input.disableWebPagePreview,
    });
    if (!response.result) throw new Error('Telegram did not return a message.');
    return createResponse(input.channel, [response.result], response.result.date ?? null);
  } catch (error) {
    if (!isCaptionFallbackError(error)) throw error;
    const results = await sendFollowUpText(input, input.plainCaption);
    return createResponse(input.channel, results, results[0]?.date ?? null);
  }
}

async function sendSinglePhoto(input: SendPostInput) {
  try {
    const result = await callTelegramFormData<MessageResult>('sendPhoto', createPhotoForm(input, input.formattedCaption, true));
    return createResponse(input.channel, result.result ? [result.result] : [], result.result?.date ?? null);
  } catch (error) {
    if (!input.contentHtml || !isCaptionFallbackError(error)) throw error;
    const firstCaption = input.plainCaption.slice(0, TELEGRAM_MEDIA_CAPTION_LIMIT);
    const result = await callTelegramFormData<MessageResult>('sendPhoto', createPhotoForm(input, firstCaption, false));
    const followUps = await sendFollowUpText(input, input.plainCaption.slice(TELEGRAM_MEDIA_CAPTION_LIMIT));
    return createResponse(
      input.channel,
      [...(result.result ? [result.result] : []), ...followUps],
      result.result?.date ?? null,
    );
  }
}

async function sendAlbum(input: SendPostInput) {
  let result: Awaited<ReturnType<typeof callTelegramFormData<MessageResult[]>>>;
  let remainder = '';
  try {
    result = await callTelegramFormData<MessageResult[]>(
      'sendMediaGroup',
      createAlbumForm(input, input.formattedCaption, true),
    );
  } catch (error) {
    if (!input.contentHtml || !isCaptionFallbackError(error)) throw error;
    const caption = input.plainCaption.slice(0, TELEGRAM_MEDIA_CAPTION_LIMIT);
    remainder = input.plainCaption.slice(TELEGRAM_MEDIA_CAPTION_LIMIT);
    result = await callTelegramFormData<MessageResult[]>(
      'sendMediaGroup',
      createAlbumForm(input, caption, false),
    );
  }
  const messages = result.result ?? [];
  const followUps = remainder ? await sendFollowUpText(input, remainder) : [];
  return createResponse(input.channel, [...messages, ...followUps], messages[0]?.date ?? null);
}

async function sendFollowUpText(input: SendPostInput, text: string) {
  return Promise.all(splitByLimit(text, TELEGRAM_TEXT_MESSAGE_LIMIT).map(async (chunk) => {
    const response = await callTelegramJson<MessageResult>('sendMessage', {
      chat_id: input.channel,
      text: chunk,
      disable_web_page_preview: input.disableWebPagePreview,
    });
    return response.result;
  })).then((values) => values.filter((value): value is MessageResult => Boolean(value)));
}

function createPhotoForm(input: SendPostInput, caption: string, parseHtml: boolean) {
  const form = new FormData();
  form.append('chat_id', input.channel);
  form.append('photo', input.media[0]!, input.media[0]!.name || 'image');
  if (caption) form.append('caption', caption);
  if (caption && parseHtml) form.append('parse_mode', 'HTML');
  if (input.disableWebPagePreview) form.append('disable_web_page_preview', 'true');
  return form;
}

function createAlbumForm(input: SendPostInput, caption: string, parseHtml: boolean) {
  const form = new FormData();
  form.append('chat_id', input.channel);
  form.append('media', JSON.stringify(addAlbumCaption(input.media, caption, parseHtml)));
  input.media.forEach((file, index) => form.append(`media_${index}`, file, file.name || `image-${index}`));
  return form;
}

function createResponse(channel: string, messages: MessageResult[], date: number | null) {
  const messageIds = messages.flatMap((message) => typeof message.message_id === 'number' ? [message.message_id] : []);
  return {
    messageIds,
    chatId: channel,
    date,
    postUrl: buildTelegramSendPostLink(channel, messageIds[0]),
  };
}
