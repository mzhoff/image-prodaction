export type TelegramInlineTokenType = 'text' | 'bold' | 'code' | 'hashtag' | 'italic' | 'link' | 'spoiler' | 'strike' | 'underline';

export interface TelegramInlineToken {
  type: TelegramInlineTokenType;
  content: string;
  href?: string;
}

interface TelegramInlineRule {
  type: TelegramInlineTokenType;
  regex: RegExp;
}

const TELEGRAM_INLINE_RULES: TelegramInlineRule[] = [
  { type: 'link', regex: /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/ },
  { type: 'bold', regex: /\*\*([^*]+)\*\*/ },
  { type: 'underline', regex: /__([^_]+)__/ },
  { type: 'strike', regex: /~~([^~]+)~~/ },
  { type: 'spoiler', regex: /\|\|([^|]+)\|\|/ },
  { type: 'italic', regex: /_([^_]+)_/ },
  { type: 'code', regex: /`([^`]+)`/ },
  { type: 'hashtag', regex: /(#[\p{L}\p{N}_]{1,64})/u },
];

export function parseTelegramInlineText(text: string): TelegramInlineToken[] {
  if (!text.length) return [{ type: 'text', content: text }];
  const match = findNextInlineMatch(text);
  if (!match) return [{ type: 'text', content: text }];

  const before = text.slice(0, match.index);
  const matchedText = match.match[0];
  const content = match.match[1] ?? '';
  const href = match.type === 'link' ? match.match[2] : undefined;
  const after = text.slice(match.index + matchedText.length);
  const tokens: TelegramInlineToken[] = [];

  if (before) {
    tokens.push(...parseTelegramInlineText(before));
  }
  tokens.push(match.type === 'link' ? { type: match.type, content, href } : { type: match.type, content });
  if (after) {
    tokens.push(...parseTelegramInlineText(after));
  }

  return tokens;
}

function findNextInlineMatch(text: string) {
  return TELEGRAM_INLINE_RULES.reduce<{
    index: number;
    match: RegExpMatchArray;
    type: TelegramInlineTokenType;
  } | null>((bestMatch, rule) => {
    const match = text.match(rule.regex);
    if (!match || match.index === undefined) return bestMatch;
    if (!bestMatch || match.index < bestMatch.index) {
      return { index: match.index, match, type: rule.type };
    }
    return bestMatch;
  }, null);
}
