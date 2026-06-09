import {
  TELEGRAM_TEXT_FORMAT_NAMES,
  type TelegramFormatSegment,
  type TelegramTextFormatName,
} from './telegram-rich-text-contract.ts';

export function parseTelegramFormatSegmentsPayload(value: string): TelegramFormatSegment[] {
  const payload = parseJsonWithControlCharacterRepair(extractJsonObject(value));
  if (!isRecord(payload) || !Array.isArray(payload.segments) || payload.segments.length === 0) {
    throw new Error('OpenRouter returned Telegram formatting in an unsupported format.');
  }

  return payload.segments.map((segment) => {
    if (!isRecord(segment) || typeof segment.text !== 'string') {
      throw new Error('OpenRouter returned Telegram formatting in an unsupported format.');
    }

    return {
      formats: parseTelegramFormatNames(segment.formats),
      text: segment.text,
    };
  });
}

function extractJsonObject(value: string) {
  const trimmed = value.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('OpenRouter returned Telegram formatting without JSON payload.');
  return trimmed.slice(start, end + 1);
}

function parseJsonWithControlCharacterRepair(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    try {
      return JSON.parse(escapeJsonControlCharactersInsideStrings(value)) as unknown;
    } catch {
      throw error;
    }
  }
}

function escapeJsonControlCharactersInsideStrings(value: string) {
  let result = '';
  let inString = false;
  let escaped = false;

  for (const character of value) {
    if (!inString) {
      result += character;
      if (character === '"') inString = true;
      continue;
    }

    if (escaped) {
      result += character;
      escaped = false;
      continue;
    }

    if (character === '\\') {
      result += character;
      escaped = true;
      continue;
    }

    if (character === '"') {
      result += character;
      inString = false;
      continue;
    }

    result += escapeJsonStringCharacter(character);
  }

  return result;
}

function escapeJsonStringCharacter(character: string) {
  if (character === '\n') return '\\n';
  if (character === '\r') return '\\r';
  if (character === '\t') return '\\t';
  if (character === '\b') return '\\b';
  if (character === '\f') return '\\f';

  const code = character.charCodeAt(0);
  return code < 0x20 ? `\\u${code.toString(16).padStart(4, '0')}` : character;
}

function parseTelegramFormatNames(value: unknown): TelegramTextFormatName[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((format): format is TelegramTextFormatName => (
    typeof format === 'string' && TELEGRAM_TEXT_FORMAT_NAMES.has(format as TelegramTextFormatName)
  ))));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
