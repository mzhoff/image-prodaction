'use client';

import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { $patchStyleText } from '@lexical/selection';
import {
  $createRangeSelection,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  type LexicalEditor,
  type LexicalNode,
  type RangeSelection,
  type TextNode,
} from 'lexical';

interface TextNodeEntry { node: TextNode }

export function TelegramMessageCharacterLimitPlugin({ characterLimit }: { characterLimit?: number }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    if (typeof characterLimit !== 'number' || characterLimit <= 0) clearCharacterLimit(editor);
    else applyCharacterLimit(editor, characterLimit);
  }, [characterLimit, editor]);
  return <OnChangePlugin
    ignoreHistoryMergeTagChange
    ignoreSelectionChange
    onChange={(_editorState, currentEditor, tags) => {
      if (typeof characterLimit !== 'number' || tags.has('character-limit-highlight')) return;
      if (characterLimit <= 0) clearCharacterLimit(currentEditor);
      else applyCharacterLimit(currentEditor, characterLimit);
    }}
  />;
}

function applyCharacterLimit(editor: LexicalEditor, characterLimit: number) {
  editor.update(() => {
    const textNodes = getAllTextNodes($getRoot(), []);
    const totalCharacters = textNodes.reduce((sum, entry) => sum + entry.node.getTextContent().length, 0);
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
  editor.update(() => clearOverLimitStyle(getAllTextNodes($getRoot(), [])), { tag: 'character-limit-highlight' });
}

function applyOverLimitStyle(textNodes: TextNodeEntry[], characterLimit: number) {
  let position = 0;
  for (const entry of textNodes) {
    const textLength = entry.node.getTextContent().length;
    if (textLength === 0) continue;
    const start = position;
    const end = position + textLength;
    position = end;
    if (end <= characterLimit) continue;
    const overflowStart = Math.max(characterLimit - start, 0);
    if (overflowStart <= 0) applyOverLimitStyleToTextNode(entry.node, 0, textLength);
    else if (overflowStart < textLength) applyOverLimitStyleToTextNode(entry.node, overflowStart, textLength);
  }
}

function applyOverLimitStyleToTextNode(node: TextNode, start: number, end: number) {
  const rangeSelection = $createRangeSelection();
  rangeSelection.setTextNodeRange(node, start, node, end);
  $patchStyleText(rangeSelection, { '--telegram-over-limit': '1' });
}

function clearOverLimitStyle(textNodes: TextNodeEntry[]) {
  for (const { node } of textNodes) {
    const style = node.getStyle();
    const nextStyle = stripTextStyleProperty(style, '--telegram-over-limit');
    if (nextStyle !== style) node.setStyle(nextStyle);
  }
}

function saveSelection() {
  const selection = $getSelection();
  return $isRangeSelection(selection) ? selection.clone() : null;
}

function restoreSelection(selection: RangeSelection | null) {
  if ($isRangeSelection(selection)) $setSelection(selection);
}

function getAllTextNodes(node: LexicalNode, nodes: TextNodeEntry[]): TextNodeEntry[] {
  if ($isTextNode(node)) {
    nodes.push({ node });
    return nodes;
  }
  const getChildren = (node as { getChildren?: () => LexicalNode[] }).getChildren;
  if (!getChildren) return nodes;
  for (const child of getChildren.call(node)) getAllTextNodes(child, nodes);
  return nodes;
}

function stripTextStyleProperty(style: string, property: string) {
  if (!style) return '';
  return style.split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.startsWith(`${property}:`))
    .join('; ');
}
