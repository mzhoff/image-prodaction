export interface TelegramChannelRecord {
  chatId: string;
  title: string;
  type: string;
  username: string | null;
  membersCount: number | null;
  botIsAdmin: boolean;
  verifiedAt: string;
}

const TELEGRAM_CHANNELS_STORAGE_KEY = 'reverie-telegram-channels-v1';

function readStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeParse(raw: string | null) {
  try {
    const parsed = JSON.parse(raw ?? 'null');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isTelegramChannelRecord);
  } catch {
    return [];
  }
}

export function loadSavedTelegramChannels() {
  const storage = readStorage();
  if (!storage) return [];

  const stored = safeParse(storage.getItem(TELEGRAM_CHANNELS_STORAGE_KEY));
  stored.sort((left, right) => new Date(right.verifiedAt).getTime() - new Date(left.verifiedAt).getTime());
  return stored;
}

export function saveTelegramChannel(channel: TelegramChannelRecord) {
  const storage = readStorage();
  if (!storage) return;

  const nextChannels = [channel, ...loadSavedTelegramChannels().filter((item) => item.chatId !== channel.chatId)];
  const nextChannelsLimited = nextChannels.slice(0, 10);
  try {
    storage.setItem(TELEGRAM_CHANNELS_STORAGE_KEY, JSON.stringify(nextChannelsLimited));
  } catch {
    // Ignore localStorage quota errors intentionally.
  }
}

export function removeTelegramChannel(chatId: string) {
  const storage = readStorage();
  if (!storage) return;

  const nextChannels = loadSavedTelegramChannels().filter((channel) => channel.chatId !== chatId);
  try {
    storage.setItem(TELEGRAM_CHANNELS_STORAGE_KEY, JSON.stringify(nextChannels));
  } catch {
    // Ignore localStorage quota errors intentionally.
  }
}

function isTelegramChannelRecord(value: unknown): value is TelegramChannelRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.chatId === 'string'
    && typeof record.title === 'string'
    && typeof record.type === 'string'
    && (record.username === null || typeof record.username === 'string')
    && (record.membersCount === null || Number.isFinite(record.membersCount))
    && typeof record.botIsAdmin === 'boolean'
    && typeof record.verifiedAt === 'string';
}
