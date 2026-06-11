import {
  FORMAT_INLINE_RULES,
  FORMAT_NAME_TO_MASK,
  type SerializedParagraphNode,
  type SerializedTextNode,
  type TelegramTextFormatName,
} from './telegram-rich-text-contract.ts';

export function normalizeTelegramPlainText(value: string | undefined) {
  return (value ?? '').replace(/\u00a0/g, ' ').trim();
}

export function normalizeTelegramRichText(value: string | undefined) {
  const nextValue = value?.trim() ?? '';
  if (!nextValue.startsWith('{')) return '';

  try {
    const parsedState = JSON.parse(nextValue) as { root?: SerializedTelegramEditorNode };
    return isTelegramEditorRoot(parsedState.root) ? nextValue : '';
  } catch {
    return '';
  }
}

export function assertTelegramFormattingPreservesText(sourceText: string, formattedPlainText: string) {
  const normalizedSourceText = normalizeTelegramPlainText(sourceText);
  const normalizedFormattedText = normalizeTelegramPlainText(formattedPlainText);
  if (normalizedSourceText !== normalizedFormattedText) {
    throw new Error('Telegram formatting changed the source text.');
  }
}

export function createParagraphFromInlineText(value: string): SerializedParagraphNode {
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

export function splitRunsIntoParagraphs(runs: Array<{ format: number; text: string }>) {
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

export function mergeSerializedTextNodes(nodes: SerializedTextNode[]) {
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

export function getPlainTextFromParagraphs(paragraphs: SerializedParagraphNode[]) {
  return paragraphs
    .map((paragraph) => paragraph.children.map((child) => child.text).join('').trim())
    .join('\n\n')
    .trim();
}

export function getSegmentFormatMask(formats: TelegramTextFormatName[] | undefined) {
  return (formats ?? []).reduce((mask, format) => mask | (FORMAT_NAME_TO_MASK[format] ?? 0), 0);
}

export function createEmptyParagraph(): SerializedParagraphNode {
  return createParagraphFromInlineText('');
}

export function createTextNode(text: string, format: number): SerializedTextNode {
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

export function stripMarkdownHeadingMarker(value: string) {
  return value
    .split('\n')
    .map((line) => line.replace(/^#{1,6}\s+/, ''))
    .join('\n');
}

export function serializeTelegramParagraphs(paragraphs: SerializedParagraphNode[]) {
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

interface SerializedTelegramEditorNode {
  children?: SerializedTelegramEditorNode[];
  text?: string;
  type?: string;
}

function isTelegramEditorRoot(node: SerializedTelegramEditorNode | undefined) {
  return node?.type === 'root'
    && Array.isArray(node.children)
    && node.children.every(isTelegramEditorNode);
}

function isTelegramEditorNode(node: SerializedTelegramEditorNode): boolean {
  if (node.type === 'paragraph') {
    return Array.isArray(node.children) && node.children.every(isTelegramEditorNode);
  }

  if (node.type === 'text') {
    return typeof node.text === 'string';
  }

  return node.type === 'linebreak';
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
