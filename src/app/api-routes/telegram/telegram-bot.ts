export const TELEGRAM_API_BASE = 'https://api.telegram.org';
export const TELEGRAM_MAX_MEDIA_ITEMS = 10;

export interface TelegramApiResult<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown error.';
}

export interface TelegramChatMember {
  status?: string;
}

export interface TelegramChat {
  id: number;
  title?: string;
  type: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramBotInfo {
  id: number;
  username?: string;
  first_name?: string;
}

function getBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
  }

  return token;
}

export function normalizeChatId(input: string) {
  const trimmed = input.trim();
  if (/^-?\d+$/.test(trimmed)) return trimmed;

  const tmeMatch = trimmed.match(/(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]+)/i);
  if (tmeMatch) return `@${tmeMatch[1]}`;

  if (trimmed.startsWith('@')) return trimmed;

  return `@${trimmed}`;
}

function getTelegramApiUrl(method: string) {
  return `${TELEGRAM_API_BASE}/bot${getBotToken()}/${method}`;
}

async function parseTelegramJson<T>(response: Response) {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as TelegramApiResult<T>;
  } catch {
    throw new Error(raw || `Telegram API error: ${response.status} ${response.statusText}`);
  }
}

function formatTelegramTransportError(error: unknown, method: string) {
  const reason = getErrorMessage(error);
  return new Error(`Telegram API transport failed for ${method}: ${reason}`);
}

export async function callTelegramJson<T>(method: string, body: Record<string, unknown>) {
  let response: Response;
  try {
    response = await fetch(getTelegramApiUrl(method), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw formatTelegramTransportError(error, method);
  }

  const payload = await parseTelegramJson<T>(response);
  if (!response.ok) {
    throw new Error(payload.description || `Telegram API request failed (${response.status}).`);
  }

  if (!payload.ok) {
    throw new Error(payload.description || 'Telegram API request failed.');
  }

  return payload;
}

export async function callTelegramFormData<T>(method: string, formData: FormData) {
  let response: Response;
  try {
    response = await fetch(getTelegramApiUrl(method), {
      method: 'POST',
      body: formData,
    });
  } catch (error) {
    throw formatTelegramTransportError(error, method);
  }

  const payload = await parseTelegramJson<T>(response);
  if (!response.ok || !payload.ok) {
    const code = payload.error_code ? ` (${payload.error_code})` : '';
    throw new Error(payload.description || `Telegram API request failed (${response.status}).${code}`);
  }

  return payload;
}

export async function getTelegramBotInfo() {
  return callTelegramJson<TelegramBotInfo>('getMe', {});
}

export async function getTelegramChat(chatId: string) {
  return callTelegramJson<TelegramChat>('getChat', { chat_id: chatId });
}

export async function getTelegramChatMemberCount(chatId: string) {
  return callTelegramJson<number>('getChatMemberCount', { chat_id: chatId });
}

export async function getTelegramChatMember(chatId: string, userId: number) {
  return callTelegramJson<TelegramChatMember>('getChatMember', {
    chat_id: chatId,
    user_id: userId,
  });
}

export function buildTelegramSendPostLink(chatId: string, messageId?: number) {
  if (!messageId) return null;
  const normalized = normalizeChatId(chatId);
  if (!normalized.startsWith('@')) return null;

  return `https://t.me/${normalized.slice(1)}/${messageId}`;
}

export interface TelegramVerifyChannelResponse {
  chatId: string;
  title: string;
  type: string;
  username: string | null;
  membersCount: number | null;
  botIsAdmin: boolean;
}

export interface TelegramSendPostResponse {
  messageIds: number[];
  chatId: string;
  date: number | null;
  postUrl: string | null;
}
