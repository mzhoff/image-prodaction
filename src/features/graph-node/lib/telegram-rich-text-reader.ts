import {
  FORMAT_NAME_TO_MASK,
  TELEGRAM_TEXT_STYLE,
  type TelegramRichTextBlock,
  type TelegramRichTextRun,
  type TelegramSerializedRichNode,
  type TelegramTextFormatName,
} from './telegram-rich-text-contract.ts';
import { normalizeTelegramRichText } from './telegram-rich-text-utils.ts';

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
    .map((child) => {
      const runs = mergeRichTextRuns(collectRichTextRuns(child));
      return runs.length > 0
        ? { runs }
        : { runs: [{ format: 0, text: '' }] };
    });

  return blocks.length > 0 ? blocks : null;
}

export function getTelegramRichTextRunText(runs: TelegramRichTextRun[]) {
  return runs.map((run) => run.text).join('');
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
    .map((paragraph) => getTelegramRichTextRunText(collectRichTextRuns(paragraph)).trimEnd())
    .join('\n\n');
}

export interface TelegramRichTextRunGroup {
  quote: boolean;
  runs: TelegramRichTextRun[];
}

export function splitTelegramRichTextRunsByQuote(runs: TelegramRichTextRun[]) {
  return runs.reduce<TelegramRichTextRunGroup[]>((groups, run) => {
    const quote = Boolean(run.quote);
    const previousGroup = groups[groups.length - 1];
    const runWithoutQuote = quote ? { ...run, quote: false } : run;

    if (previousGroup && previousGroup.quote === quote) {
      previousGroup.runs.push(runWithoutQuote);
      return groups;
    }

    groups.push({ quote, runs: [runWithoutQuote] });
    return groups;
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
