import { $convertFromMarkdownString, BOLD_ITALIC_STAR, BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR, BOLD_UNDERSCORE, HEADING, INLINE_CODE, ITALIC_STAR, ITALIC_UNDERSCORE,
  LINK, ORDERED_LIST, QUOTE, STRIKETHROUGH, UNORDERED_LIST,
} from '@lexical/markdown';
import type { Transformer } from '@lexical/markdown';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import type { LexicalEditor } from 'lexical';

const ARTICLE_MARKDOWN_TRANSFORMERS: Transformer[] = [
  HEADING, QUOTE, UNORDERED_LIST, ORDERED_LIST, LINK, BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE, BOLD_STAR, BOLD_UNDERSCORE, ITALIC_STAR,
  ITALIC_UNDERSCORE, STRIKETHROUGH, INLINE_CODE,
];

export function getInitialEditorState(
  richText: string | undefined,
  value: string | undefined,
  parseMarkdown: boolean,
) {
  const normalizedRichText = normalizeArticleRichText(richText);
  if (normalizedRichText) return normalizedRichText;
  return () => rebuildEditorState(value, parseMarkdown);
}

export function rebuildEditorState(value: string | undefined, parseMarkdown: boolean) {
  const text = value?.trim() ?? '';
  const root = $getRoot();
  root.clear();
  if (!text) {
    root.append($createParagraphNode());
    return;
  }
  if (parseMarkdown) {
    $convertFromMarkdownString(text, ARTICLE_MARKDOWN_TRANSFORMERS);
    return;
  }
  for (const block of text.split(/\n{2,}/)) {
    const paragraph = $createParagraphNode();
    paragraph.append($createTextNode(block.trim()));
    root.append(paragraph);
  }
}

export function parseRichEditorState(editor: LexicalEditor, richText: string) {
  try {
    return editor.parseEditorState(richText);
  } catch {
    return null;
  }
}

export function normalizeArticleRichText(value: string | undefined) {
  if (!value?.trim()) return '';
  try {
    const parsed = JSON.parse(value) as { root?: { children?: unknown[] } };
    return Array.isArray(parsed.root?.children) ? value : '';
  } catch {
    return '';
  }
}

export function normalizeEditorUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  if (/^(https?:|data:image\/|blob:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function getPlainTextFromArticleRichText(richText: string | undefined) {
  const normalizedRichText = normalizeArticleRichText(richText);
  if (!normalizedRichText) return '';
  try {
    const parsed = JSON.parse(normalizedRichText) as {
      root?: { children?: SerializedArticleNode[] };
    };
    return collectBlockTexts(parsed.root?.children ?? []).join('\n\n').trim();
  } catch {
    return '';
  }
}

interface SerializedArticleNode {
  children?: SerializedArticleNode[];
  text?: string;
  type?: string;
}

function collectBlockTexts(nodes: SerializedArticleNode[]) {
  return nodes.flatMap((node) => {
    if (node.type === 'list') return collectListItemTexts(node.children ?? []);
    const text = collectInlineText(node).trim();
    return text ? [text] : [];
  });
}

function collectListItemTexts(nodes: SerializedArticleNode[]) {
  return nodes.flatMap((node) => {
    const text = collectInlineText(node).trim();
    return text ? [text] : [];
  });
}

function collectInlineText(node: SerializedArticleNode): string {
  if (typeof node.text === 'string') return node.text;
  if (node.type === 'article-image') return '[Image]';
  return (node.children ?? []).map(collectInlineText).join('');
}
