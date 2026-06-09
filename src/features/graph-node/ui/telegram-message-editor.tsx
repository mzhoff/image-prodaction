'use client';

import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { $patchStyleText } from '@lexical/selection';
import {
  $createParagraphNode,
  $createTextNode,
  $createRangeSelection,
  $getRoot,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  $getSelection,
  type LexicalEditor,
  type LexicalNode,
  type RangeSelection,
  type TextNode,
} from 'lexical';
import {
  normalizeTelegramPlainText,
  normalizeTelegramRichText,
  type TelegramMessageEditorValue,
} from '../lib/telegram-rich-text';
import { splitTelegramMessageParagraphs } from '../lib/telegram-message-blocks';
import { cn } from '@/shared/lib/cn';
import { TelegramTextContextMenuPlugin, type TelegramTextContextMenuFeature } from './telegram-message-editor-context-menu';

interface TelegramMessageEditorProps {
  contextMenuFeatures?: readonly TelegramTextContextMenuFeature[];
  editorClassName?: string;
  minHeight?: number;
  namespace?: string;
  onChange?: (value: TelegramMessageEditorValue) => void;
  characterLimit?: number;
  placeholder?: string;
  richText?: string;
  shellClassName?: string;
  value?: string;
}

export function TelegramMessageEditor({
  contextMenuFeatures,
  editorClassName,
  minHeight,
  namespace = 'TelegramMessageEditor',
  onChange,
  characterLimit,
  placeholder = 'Message',
  richText,
  shellClassName,
  value,
}: TelegramMessageEditorProps) {
  const initialValueRef = useRef(value);
  const initialRichTextRef = useRef(richText);
  const editorStyle = minHeight ? { '--telegram-editor-min-height': `${minHeight}px` } as CSSProperties : undefined;
  const editorConfig = useMemo(() => ({
    editorState: getInitialRichEditorState(initialRichTextRef.current)
      || (() => rebuildEditorState(initialValueRef.current)),
    namespace,
    onError: (error: Error, editor: LexicalEditor) => {
      console.error('Telegram message editor failed', { editor, error });
    },
    theme: {
      paragraph: 'telegram-message-editor-paragraph',
      text: {
        bold: 'telegram-message-editor-bold',
        code: 'telegram-message-editor-code',
        italic: 'telegram-message-editor-italic',
        strikethrough: 'telegram-message-editor-strikethrough',
        underline: 'telegram-message-editor-underline',
      },
    },
  }), [namespace]);

  return (
    <div
      className={cn('telegram-message-editor-shell', shellClassName)}
      data-canvas-wheel-scroll="true"
      data-node-interactive
      style={editorStyle}
    >
      <LexicalComposer initialConfig={editorConfig}>
        <RichTextPlugin
          contentEditable={(
            <ContentEditable
              aria-label="Telegram message"
              className={cn('telegram-message-editor', editorClassName)}
              data-node-interactive
              spellCheck={false}
            />
          )}
          placeholder={<div className="telegram-message-editor-placeholder">{placeholder}</div>}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <TelegramMessageSyncPlugin richText={richText} value={value} />
        <TelegramMessageCharacterLimitPlugin characterLimit={characterLimit} />
        <TelegramMessageChangePlugin onChange={onChange} />
        <TelegramTextContextMenuPlugin features={contextMenuFeatures} />
      </LexicalComposer>
    </div>
  );
}

function TelegramMessageChangePlugin({ onChange }: { onChange?: (value: TelegramMessageEditorValue) => void }) {
  return (
    <OnChangePlugin
      ignoreHistoryMergeTagChange
      ignoreSelectionChange
      onChange={(editorState, _editor, tags) => {
        if (tags.has('external-sync')) return;
        const richText = JSON.stringify(editorState.toJSON());
        editorState.read(() => {
          onChange?.({
            plainText: normalizeTelegramPlainText($getRoot().getTextContent()),
            richText,
          });
        });
      }}
    />
  );
}

function TelegramMessageSyncPlugin({ richText, value }: Pick<TelegramMessageEditorProps, 'richText' | 'value'>) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    let currentText = '';
    const editorState = editor.getEditorState();
    const currentRichText = JSON.stringify(editorState.toJSON());
    editorState.read(() => {
      currentText = normalizeTelegramPlainText($getRoot().getTextContent());
    });

    const nextText = normalizeTelegramPlainText(value);
    const nextRichText = normalizeTelegramRichText(richText);
    if (nextRichText) {
      if (currentText === nextText && currentRichText === nextRichText) return;

      const parsedState = parseRichEditorState(editor, nextRichText);
      if (parsedState) {
        editor.setEditorState(parsedState, { tag: 'external-sync' });
        return;
      }
    }

    if (currentText === nextText) return;

    editor.update(() => {
      rebuildEditorState(value);
    }, { tag: 'external-sync' });
  }, [editor, richText, value]);

  return null;
}

function TelegramMessageCharacterLimitPlugin({ characterLimit }: { characterLimit?: number }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (typeof characterLimit !== 'number') {
      clearCharacterLimit(editor);
      return;
    }

    if (characterLimit <= 0) {
      clearCharacterLimit(editor);
      return;
    }

    applyCharacterLimit(editor, characterLimit);
  }, [characterLimit, editor]);

  return (
    <OnChangePlugin
      ignoreHistoryMergeTagChange
      ignoreSelectionChange
      onChange={(_editorState, editor, tags) => {
        if (typeof characterLimit !== 'number' || tags.has('character-limit-highlight')) return;

        if (characterLimit <= 0) {
          clearCharacterLimit(editor);
          return;
        }

        applyCharacterLimit(editor, characterLimit);
      }}
    />
  );
}

function parseRichEditorState(editor: LexicalEditor, richText: string | undefined) {
  const normalizedRichText = normalizeTelegramRichText(richText);
  if (!normalizedRichText) return null;

  try {
    return editor.parseEditorState(normalizedRichText);
  } catch {
    return null;
  }
}

function getInitialRichEditorState(richText: string | undefined) {
  const normalizedRichText = normalizeTelegramRichText(richText);
  if (!normalizedRichText) return '';

  try {
    const parsedState = JSON.parse(normalizedRichText) as { root?: { children?: unknown[] } };
    return Array.isArray(parsedState.root?.children) ? normalizedRichText : '';
  } catch {
    return '';
  }
}

function rebuildEditorState(value: string | undefined) {
  const root = $getRoot();
  const blocks = splitTelegramMessageParagraphs(normalizeTelegramPlainText(value), { trimParagraphs: true, removeEmptyParagraphs: false });
  root.clear();

  if (blocks.length === 0 || blocks.every((block) => !block.trim())) {
    root.append($createParagraphNode());
    return;
  }

  for (const block of blocks) {
    const paragraph = $createParagraphNode();
    paragraph.append($createTextNode(block.trim()));
    root.append(paragraph);
  }
}

function applyCharacterLimit(editor: LexicalEditor, characterLimit: number) {
  editor.update(() => {
  const textNodes = getAllTextNodes($getRoot(), []);
    const totalCharacters = textNodes.reduce((sum, node) => sum + node.node.getTextContent().length, 0);

    if (totalCharacters <= characterLimit) {
      clearOverLimitStyle(textNodes);
      return;
    }

    const previousSelection = saveSelection();
    clearOverLimitStyle(textNodes);
    applyOverLimitStyle(textNodes, characterLimit);
    restoreSelection(previousSelection);
  }, { tag: 'character-limit-highlight' });
}

function clearCharacterLimit(editor: LexicalEditor) {
  editor.update(() => {
    clearOverLimitStyle(getAllTextNodes($getRoot(), []));
  }, { tag: 'character-limit-highlight' });
}

function applyOverLimitStyle(textNodes: TextNodeEntry[], characterLimit: number) {
  let position = 0;
  for (const node of textNodes) {
    const textLength = node.node.getTextContent().length;
    if (textLength === 0) {
      continue;
    }

    const start = position;
    const end = position + textLength;
    if (end <= characterLimit) {
      position = end;
      continue;
    }

    const overflowStart = Math.max(characterLimit - start, 0);
    if (overflowStart <= 0) {
      applyOverLimitStyleToTextNode(node.node, 0, textLength);
    } else if (overflowStart < textLength) {
      applyOverLimitStyleToTextNode(node.node, overflowStart, textLength);
    }

    if (start >= characterLimit) {
      position = end;
      continue;
    }

    position = end;
  }
}

function applyOverLimitStyleToTextNode(node: TextNodeEntry['node'], start: number, end: number) {
  const rangeSelection = $createRangeSelection();
  rangeSelection.setTextNodeRange(node, start, node, end);
  $patchStyleText(rangeSelection, { '--telegram-over-limit': '1' });
}

function clearOverLimitStyle(textNodes: TextNodeEntry[]) {
  for (const node of textNodes) {
    const style = node.node.getStyle();
    const nextStyle = stripTextStyleProperty(style, '--telegram-over-limit');
    if (nextStyle !== style) {
      node.node.setStyle(nextStyle);
    }
  }
}

function saveSelection() {
  const selection = $getSelection();
  return $isRangeSelection(selection) ? selection.clone() : null;
}

function restoreSelection(selection: RangeSelection | null) {
  if ($isRangeSelection(selection)) {
    $setSelection(selection);
  }
}

function getAllTextNodes(node: LexicalNode, nodes: TextNodeEntry[]): TextNodeEntry[] {
  if ($isTextNode(node)) {
    nodes.push({ node });
    return nodes;
  }

  const getChildren = (node as { getChildren?: () => LexicalNode[] }).getChildren;
  if (!getChildren) {
    return nodes;
  }

  for (const child of getChildren.call(node)) {
    getAllTextNodes(child, nodes);
  }

  return nodes;
}

function stripTextStyleProperty(style: string, property: string) {
  if (!style) return '';
  return style
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .filter((part) => !part.startsWith(`${property}:`))
    .join('; ');
}

interface TextNodeEntry {
  node: TextNode;
}
