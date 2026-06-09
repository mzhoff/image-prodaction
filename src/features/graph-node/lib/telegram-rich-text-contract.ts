export interface TelegramMessageEditorValue {
  plainText: string;
  richText: string;
}

export type TelegramTextFormatName = 'bold' | 'code' | 'italic' | 'strike' | 'underline';

export interface TelegramFormatSegment {
  formats?: TelegramTextFormatName[];
  text: string;
}

export interface TelegramRichTextBlock {
  runs: TelegramRichTextRun[];
}

export interface TelegramRichTextRun {
  format: number;
  link?: string;
  quote?: boolean;
  spoiler?: boolean;
  text: string;
}

export interface TelegramSerializedRichNode {
  children?: TelegramSerializedRichNode[];
  format?: number | string;
  style?: string;
  text?: string;
  textFormat?: number;
  type?: string;
}

export interface SerializedTextNode {
  detail: number;
  format: number;
  mode: 'normal';
  style: string;
  text: string;
  type: 'text';
  version: number;
}

export interface SerializedParagraphNode {
  children: SerializedTextNode[];
  direction: null;
  format: '';
  indent: number;
  textFormat: number;
  textStyle: string;
  type: 'paragraph';
  version: number;
}

export const TELEGRAM_TEXT_FORMAT = {
  bold: 1,
  italic: 2,
  strike: 4,
  underline: 8,
  code: 16,
} as const;

export const TELEGRAM_TEXT_STYLE = {
  link: '--telegram-link',
  quote: '--telegram-quote',
  overLimit: '--telegram-over-limit',
  spoiler: '--telegram-spoiler',
} as const;

export const FORMAT_NAME_TO_MASK: Record<TelegramTextFormatName, number> = {
  bold: TELEGRAM_TEXT_FORMAT.bold,
  code: TELEGRAM_TEXT_FORMAT.code,
  italic: TELEGRAM_TEXT_FORMAT.italic,
  strike: TELEGRAM_TEXT_FORMAT.strike,
  underline: TELEGRAM_TEXT_FORMAT.underline,
};

export const TELEGRAM_TEXT_FORMAT_NAMES = new Set<TelegramTextFormatName>(['bold', 'code', 'italic', 'strike', 'underline']);

export const FORMAT_INLINE_RULES = [
  { format: TELEGRAM_TEXT_FORMAT.code, regex: /`([^`]+)`/ },
  { format: TELEGRAM_TEXT_FORMAT.bold, regex: /\*\*([^*]+)\*\*/ },
  { format: TELEGRAM_TEXT_FORMAT.underline, regex: /__([^_]+)__/ },
  { format: TELEGRAM_TEXT_FORMAT.strike, regex: /~~([^~]+)~~/ },
  { format: TELEGRAM_TEXT_FORMAT.italic, regex: /\*([^*]+)\*/ },
  { format: TELEGRAM_TEXT_FORMAT.italic, regex: /_([^_]+)_/ },
];
