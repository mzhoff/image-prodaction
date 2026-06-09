export type TelegramMessageBlockKind = 'paragraph' | 'quote';

export interface TelegramMessageBlock {
  kind: TelegramMessageBlockKind;
  text: string;
}

export interface TelegramMessageParagraphSplitOptions {
  /**
   * Remove leading/trailing spaces for each paragraph.
   */
  trimParagraphs?: boolean;
  /**
   * Skip empty paragraphs and paragraphs that become empty after trimming.
   */
  removeEmptyParagraphs?: boolean;
}

export function normalizeTelegramMessageText(value: string): string {
  return value.replace(/\r/g, '');
}

export function splitTelegramMessageParagraphs(value: string, options: TelegramMessageParagraphSplitOptions = {}) {
  const { trimParagraphs = true, removeEmptyParagraphs = false } = options;

  const normalizedValue = normalizeTelegramMessageText(value);
  const rawParagraphs = normalizedValue.split(/\n{2,}/);
  const paragraphs = trimParagraphs ? rawParagraphs.map((paragraph) => paragraph.trim()) : rawParagraphs;

  return removeEmptyParagraphs
    ? paragraphs.filter((paragraph) => paragraph.trim().length > 0)
    : paragraphs;
}

export function parseTelegramMessageBlocks(value: string): TelegramMessageBlock[] {
  return normalizeTelegramMessageText(value)
    .split('\n')
    .map((block) => {
      const quoteText = getTelegramQuoteText(block);
      return quoteText
        ? { kind: 'quote', text: quoteText }
        : { kind: 'paragraph', text: block };
    });
}

export function getTelegramQuoteText(block: string) {
  const lines = block.split('\n');
  if (!lines.every((line) => line.trimStart().startsWith('>'))) return '';

  return lines.map((line) => line.trimStart().replace(/^>\s?/, '')).join('\n').trim();
}
