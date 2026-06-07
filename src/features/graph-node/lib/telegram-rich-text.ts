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

interface TelegramSerializedRichNode {
  children?: TelegramSerializedRichNode[];
  format?: number | string;
  style?: string;
  text?: string;
  textFormat?: number;
  type?: string;
}

interface SerializedTextNode {
  detail: number;
  format: number;
  mode: 'normal';
  style: string;
  text: string;
  type: 'text';
  version: number;
}

interface SerializedParagraphNode {
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
  spoiler: '--telegram-spoiler',
} as const;

const FORMAT_NAME_TO_MASK: Record<TelegramTextFormatName, number> = {
  bold: TELEGRAM_TEXT_FORMAT.bold,
  code: TELEGRAM_TEXT_FORMAT.code,
  italic: TELEGRAM_TEXT_FORMAT.italic,
  strike: TELEGRAM_TEXT_FORMAT.strike,
  underline: TELEGRAM_TEXT_FORMAT.underline,
};

const TELEGRAM_TEXT_FORMAT_NAMES = new Set<TelegramTextFormatName>(['bold', 'code', 'italic', 'strike', 'underline']);

const FORMAT_INLINE_RULES = [
  { format: TELEGRAM_TEXT_FORMAT.code, regex: /`([^`]+)`/ },
  { format: TELEGRAM_TEXT_FORMAT.bold, regex: /\*\*([^*]+)\*\*/ },
  { format: TELEGRAM_TEXT_FORMAT.underline, regex: /__([^_]+)__/ },
  { format: TELEGRAM_TEXT_FORMAT.strike, regex: /~~([^~]+)~~/ },
  { format: TELEGRAM_TEXT_FORMAT.italic, regex: /\*([^*]+)\*/ },
  { format: TELEGRAM_TEXT_FORMAT.italic, regex: /_([^_]+)_/ },
];

export function normalizeTelegramPlainText(value: string | undefined) {
  return (value ?? '').replace(/\u00a0/g, ' ').trim();
}

export function normalizeTelegramRichText(value: string | undefined) {
  const nextValue = value?.trim() ?? '';
  return nextValue.startsWith('{') ? nextValue : '';
}

export function getTelegramRichTextBlocks(_messageText: string, messageRichText: string | undefined): TelegramRichTextBlock[] | null {
  if (!messageRichText?.trim()) return null;

  let parsedState: { root?: { children?: TelegramSerializedRichNode[] } };
  try {
    parsedState = JSON.parse(messageRichText) as { root?: { children?: TelegramSerializedRichNode[] } };
  } catch {
    return null;
  }

  const children = parsedState.root?.children;
  if (!Array.isArray(children)) return null;

  const blocks = children
    .map((child) => ({ runs: mergeRichTextRuns(collectRichTextRuns(child)) }))
    .filter((block) => getTelegramRichTextRunText(block.runs).trim().length > 0);

  return blocks.length > 0 ? blocks : null;
}

export function getTelegramRichTextRunText(runs: TelegramRichTextRun[]) {
  return runs.map((run) => run.text).join('');
}

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

export function createTelegramFormattedEditorValue(value: string): TelegramMessageEditorValue {
  const normalizedText = normalizeTelegramPlainText(value);
  const paragraphs = normalizedText
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => createParagraphFromInlineText(stripMarkdownHeadingMarker(block)));
  const plainText = paragraphs
    .map((paragraph) => paragraph.children.map((child) => child.text).join(''))
    .join('\n\n')
    .trim();

  return {
    plainText,
    richText: serializeTelegramParagraphs(paragraphs),
  };
}

export function createTelegramEditorValueFromSegments(
  sourceText: string,
  segments: TelegramFormatSegment[],
): TelegramMessageEditorValue {
  const normalizedText = normalizeTelegramPlainText(sourceText);
  const runs = segments.map((segment) => ({
    format: getSegmentFormatMask(segment.formats),
    text: segment.text,
  }));
  assertTelegramRunsPreserveText(normalizedText, runs);

  const paragraphs = splitRunsIntoParagraphs(runs).map((paragraphRuns) => ({
    children: mergeSerializedTextNodes(paragraphRuns
      .filter((run) => run.text.length > 0)
      .map((run) => createTextNode(run.text, run.format))),
    direction: null,
    format: '',
    indent: 0,
    textFormat: 0,
    textStyle: '',
    type: 'paragraph',
    version: 1,
  } satisfies SerializedParagraphNode));
  const normalizedParagraphs = paragraphs.length > 0 ? paragraphs : [createEmptyParagraph()];
  const plainText = getPlainTextFromParagraphs(normalizedParagraphs);

  assertTelegramFormattingPreservesText(normalizedText, plainText);
  return {
    plainText,
    richText: serializeTelegramParagraphs(normalizedParagraphs),
  };
}

export function createTelegramFallbackFormatSegments(sourceText: string): TelegramFormatSegment[] {
  const normalizedText = normalizeTelegramPlainText(sourceText);
  if (!normalizedText) return [];

  const firstMeaningfulMatch = normalizedText.match(/\S[\s\S]*?(?:[.!?…](?=\s|$)|\n|$)/);
  const highlightEnd = firstMeaningfulMatch?.index !== undefined
    ? firstMeaningfulMatch.index + firstMeaningfulMatch[0].length
    : 0;
  if (highlightEnd <= 0 || highlightEnd >= normalizedText.length) {
    return [{ text: normalizedText, formats: ['bold' as const] }];
  }

  return [
    { text: normalizedText.slice(0, highlightEnd).trimEnd(), formats: ['bold' as const] },
    { text: normalizedText.slice(highlightEnd) },
  ].filter((segment) => segment.text.length > 0);
}

export function serializeTelegramPlainText(value: string): string {
  const normalizedText = normalizeTelegramPlainText(value);
  const paragraphs = normalizedText
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => createParagraphFromInlineText(block));
  return serializeTelegramParagraphs(paragraphs.length > 0 ? paragraphs : [createEmptyParagraph()]);
}

export function getPlainTextFromTelegramRichText(richText: string | undefined) {
  const normalizedRichText = normalizeTelegramRichText(richText);
  if (!normalizedRichText) return '';

  let parsedState: { root?: { children?: TelegramSerializedRichNode[] } };
  try {
    parsedState = JSON.parse(normalizedRichText) as { root?: { children?: TelegramSerializedRichNode[] } };
  } catch {
    return '';
  }

  const paragraphs = parsedState.root?.children;
  if (!Array.isArray(paragraphs)) return '';
  return paragraphs
    .map((paragraph) => getTelegramRichTextRunText(collectRichTextRuns(paragraph)).trim())
    .join('\n\n')
    .trim();
}

export function assertTelegramFormattingPreservesText(sourceText: string, formattedPlainText: string) {
  const normalizedSourceText = normalizeTelegramPlainText(sourceText);
  const normalizedFormattedText = normalizeTelegramPlainText(formattedPlainText);
  if (normalizedSourceText !== normalizedFormattedText) {
    throw new Error('Telegram formatting changed the source text.');
  }
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

function createParagraphFromInlineText(value: string): SerializedParagraphNode {
  const children = parseInlineFormatRuns(value, 0)
    .filter((run) => run.text.length > 0)
    .map((run) => createTextNode(run.text, run.format));

  return {
    children: children.length > 0 ? children : [createTextNode('', 0)],
    direction: null,
    format: '',
    indent: 0,
    textFormat: 0,
    textStyle: '',
    type: 'paragraph',
    version: 1,
  };
}

function splitRunsIntoParagraphs(runs: Array<{ format: number; text: string }>) {
  const paragraphs: Array<Array<{ format: number; text: string }>> = [[]];

  for (const run of runs) {
    const parts = run.text.split(/(\n{2,})/);
    for (const part of parts) {
      if (!part) continue;
      if (/^\n{2,}$/.test(part)) {
        paragraphs.push([]);
        continue;
      }

      paragraphs[paragraphs.length - 1]?.push({ format: run.format, text: part });
    }
  }

  return paragraphs.filter((paragraph) => paragraph.some((run) => run.text.trim().length > 0));
}

function mergeSerializedTextNodes(nodes: SerializedTextNode[]) {
  return nodes.reduce<SerializedTextNode[]>((mergedNodes, node) => {
    const previousNode = mergedNodes[mergedNodes.length - 1];
    if (previousNode && previousNode.format === node.format) {
      previousNode.text += node.text;
      return mergedNodes;
    }

    mergedNodes.push({ ...node });
    return mergedNodes;
  }, []);
}

function collectRichTextRuns(node: TelegramSerializedRichNode, inheritedFormat = 0): TelegramRichTextRun[] {
  if (typeof node.text === 'string') {
    const nodeFormat = getSerializedTextFormatMask(node.format);
    const style = getTelegramStyleMetadata(node.style);
    return [{ format: inheritedFormat | nodeFormat, ...style, text: node.text }];
  }

  if (node.type === 'linebreak') {
    return [{ format: inheritedFormat, text: '\n' }];
  }

  if (!Array.isArray(node.children)) return [];
  return node.children.flatMap((child) => collectRichTextRuns(child, inheritedFormat));
}

function getSerializedTextFormatMask(format: TelegramSerializedRichNode['format']) {
  if (typeof format === 'number') return format;
  if (typeof format !== 'string') return 0;

  return format
    .split(/\s+/)
    .reduce((mask, formatName) => mask | (FORMAT_NAME_TO_MASK[normalizeSerializedFormatName(formatName)] ?? 0), 0);
}

function normalizeSerializedFormatName(formatName: string): TelegramTextFormatName {
  if (formatName === 'strikethrough') return 'strike';
  if (formatName === 'monospace') return 'code';
  return formatName as TelegramTextFormatName;
}

function mergeRichTextRuns(runs: TelegramRichTextRun[]) {
  return runs.reduce<TelegramRichTextRun[]>((mergedRuns, run) => {
    const previousRun = mergedRuns[mergedRuns.length - 1];
    if (previousRun && previousRun.format === run.format && previousRun.link === run.link && previousRun.quote === run.quote && previousRun.spoiler === run.spoiler) {
      previousRun.text += run.text;
      return mergedRuns;
    }

    mergedRuns.push({ ...run });
    return mergedRuns;
  }, []);
}

function getTelegramStyleMetadata(style: string | undefined) {
  return {
    link: decodeStyleValue(getStyleProperty(style, TELEGRAM_TEXT_STYLE.link)),
    quote: getStyleProperty(style, TELEGRAM_TEXT_STYLE.quote) === '1',
    spoiler: getStyleProperty(style, TELEGRAM_TEXT_STYLE.spoiler) === '1',
  };
}

function getStyleProperty(style: string | undefined, property: string) {
  if (!style) return '';
  const match = style.match(new RegExp(`${escapeRegExp(property)}\\s*:\\s*([^;]+)`));
  return match?.[1]?.trim() ?? '';
}

function decodeStyleValue(value: string) {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getPlainTextFromParagraphs(paragraphs: SerializedParagraphNode[]) {
  return paragraphs
    .map((paragraph) => paragraph.children.map((child) => child.text).join('').trim())
    .join('\n\n')
    .trim();
}

function getSegmentFormatMask(formats: TelegramTextFormatName[] | undefined) {
  return (formats ?? []).reduce((mask, format) => mask | (FORMAT_NAME_TO_MASK[format] ?? 0), 0);
}

function assertTelegramRunsPreserveText(sourceText: string, runs: Array<{ text: string }>) {
  const candidateText = runs.map((run) => run.text).join('');
  assertTelegramFormattingPreservesText(sourceText, candidateText);
}

function createEmptyParagraph(): SerializedParagraphNode {
  return createParagraphFromInlineText('');
}

function createTextNode(text: string, format: number): SerializedTextNode {
  return {
    detail: 0,
    format,
    mode: 'normal',
    style: '',
    text,
    type: 'text',
    version: 1,
  };
}

function parseInlineFormatRuns(text: string, inheritedFormat: number): Array<{ format: number; text: string }> {
  const match = findNextFormatMatch(text);
  if (!match) return [{ format: inheritedFormat, text }];

  const before = text.slice(0, match.index);
  const matchedText = match.match[0];
  const content = match.match[1] ?? '';
  const after = text.slice(match.index + matchedText.length);
  const runs: Array<{ format: number; text: string }> = [];

  if (before) runs.push({ format: inheritedFormat, text: before });
  runs.push(...parseInlineFormatRuns(content, inheritedFormat | match.format));
  if (after) runs.push(...parseInlineFormatRuns(after, inheritedFormat));
  return runs;
}

function findNextFormatMatch(text: string) {
  return FORMAT_INLINE_RULES.reduce<{
    format: number;
    index: number;
    match: RegExpMatchArray;
  } | null>((bestMatch, rule) => {
    const match = text.match(rule.regex);
    if (!match || match.index === undefined) return bestMatch;
    if (!bestMatch || match.index < bestMatch.index) {
      return { format: rule.format, index: match.index, match };
    }
    return bestMatch;
  }, null);
}

function stripMarkdownHeadingMarker(value: string) {
  return value
    .split('\n')
    .map((line) => line.replace(/^#{1,6}\s+/, ''))
    .join('\n');
}

function serializeTelegramParagraphs(paragraphs: SerializedParagraphNode[]) {
  return JSON.stringify({
    root: {
      children: paragraphs,
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  });
}
