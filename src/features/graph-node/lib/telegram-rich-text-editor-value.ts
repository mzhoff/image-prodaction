import type {
  SerializedParagraphNode,
  TelegramFormatSegment,
  TelegramMessageEditorValue,
} from './telegram-rich-text-contract.ts';
import {
  assertTelegramFormattingPreservesText,
  createEmptyParagraph,
  createParagraphFromInlineText,
  createTextNode,
  getPlainTextFromParagraphs,
  getSegmentFormatMask,
  mergeSerializedTextNodes,
  normalizeTelegramPlainText,
  serializeTelegramParagraphs,
  splitRunsIntoParagraphs,
  stripMarkdownHeadingMarker,
} from './telegram-rich-text-utils.ts';
import { splitTelegramMessageParagraphs } from './telegram-message-blocks.ts';

export function createTelegramFormattedEditorValue(value: string): TelegramMessageEditorValue {
  const normalizedText = normalizeTelegramPlainText(value);
  const paragraphs = splitTelegramMessageParagraphs(normalizedText, { removeEmptyParagraphs: true })
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
  const paragraphs = splitTelegramMessageParagraphs(normalizedText, { removeEmptyParagraphs: true })
    .map((block) => createParagraphFromInlineText(block));
  return serializeTelegramParagraphs(paragraphs.length > 0 ? paragraphs : [createEmptyParagraph()]);
}

function assertTelegramRunsPreserveText(sourceText: string, runs: Array<{ text: string }>) {
  const candidateText = runs.map((run) => run.text).join('');
  assertTelegramFormattingPreservesText(sourceText, candidateText);
}
