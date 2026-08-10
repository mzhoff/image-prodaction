import type { TextPromptVariableDisplayMode } from '@/entities/production-graph/model/types';
import {
  formatTextPromptVariableParts,
  getTextPromptMentionToken,
  splitTextPromptMentionTokens,
} from '../lib/text-prompt-variables';

export interface TextPromptVariableEditorSlot {
  alias: string;
  mentionAliases?: string[];
  portId: string;
  value: string;
}

export interface ActiveMention {
  end: number;
  query: string;
  start: number;
}

export function renderEditorContent(
  editor: HTMLDivElement,
  tokens: ReturnType<typeof splitTextPromptMentionTokens>,
  slots: TextPromptVariableEditorSlot[],
  displayMode: TextPromptVariableDisplayMode,
) {
  const fragment = document.createDocumentFragment();
  for (const token of tokens) {
    if (token.type === 'text') {
      if (token.text) fragment.appendChild(document.createTextNode(token.text));
      continue;
    }
    const slot = slots.find((item) => item.alias === token.alias || item.mentionAliases?.includes(token.alias));
    const alias = slot?.alias ?? token.alias;
    const chip = document.createElement('span');
    chip.className = 'text-prompt-variable-chip';
    chip.contentEditable = 'false';
    chip.dataset.mentionAlias = alias;
    const formatted = formatTextPromptVariableParts(alias, slot?.value ?? token.value, displayMode);
    appendChipContent(chip, formatted);
    fragment.appendChild(chip);
  }
  editor.replaceChildren(fragment);
}

export function readEditorValue(root: Node) {
  let value = '';
  let previousWasMention = false;
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (previousWasMention && text && !isMentionDelimiter(text[0] ?? '')) value += ' ';
      value += text;
      previousWasMention = false;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    if (node instanceof HTMLElement && node.dataset.mentionAlias) {
      value += getTextPromptMentionToken(node.dataset.mentionAlias);
      previousWasMention = true;
      return;
    }
    if (node instanceof HTMLBRElement) {
      value += '\n';
      previousWasMention = false;
      return;
    }
    node.childNodes.forEach(visit);
  };
  root.childNodes.forEach(visit);
  return value;
}

export function getActiveMention(value: string, cursor: number): ActiveMention | null {
  const before = value.slice(0, cursor);
  const match = before.match(/(^|[\s([{])@([^\s@]*)$/);
  if (!match) return null;
  const query = match[2] ?? '';
  return { start: before.length - query.length - 1, end: cursor, query };
}

export function getSelectionRawOffset(editor: HTMLDivElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return readEditorValue(editor).length;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.endContainer)) return readEditorValue(editor).length;
  const prefixRange = document.createRange();
  prefixRange.selectNodeContents(editor);
  prefixRange.setEnd(range.endContainer, range.endOffset);
  return readEditorValue(prefixRange.cloneContents()).length;
}

export function setCaretByRawOffset(editor: HTMLDivElement, rawOffset: number) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  const position = findDomPositionForRawOffset(editor, rawOffset);
  range.setStart(position.node, position.offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function getEditorCaretPoint(editor: HTMLDivElement) {
  const selection = window.getSelection();
  const editorRect = editor.getBoundingClientRect();
  if (!selection || selection.rangeCount === 0 || !selection.focusNode || !editor.contains(selection.focusNode)) {
    return { left: editorRect.left + 10, top: editorRect.top + 30 };
  }
  const range = selection.getRangeAt(0).cloneRange();
  let rect = range.getBoundingClientRect();
  let marker: HTMLSpanElement | null = null;
  if (rect.width === 0 && rect.height === 0) {
    marker = document.createElement('span');
    marker.textContent = '\u200b';
    range.insertNode(marker);
    rect = marker.getBoundingClientRect();
  }
  const margin = 8;
  const menuWidth = 178;
  const menuHeight = 240;
  const caretLeft = rect.left || editorRect.left + 10;
  const caretTop = rect.top || editorRect.top + 10;
  const belowTop = (rect.bottom || caretTop + 16) + 6;
  const left = Math.min(Math.max(caretLeft, margin), Math.max(margin, window.innerWidth - menuWidth - margin));
  const preferredTop = belowTop + menuHeight > window.innerHeight - margin ? caretTop - menuHeight - 6 : belowTop;
  const top = Math.min(Math.max(preferredTop, margin), Math.max(margin, window.innerHeight - margin - 32));
  if (marker) {
    marker.remove();
    editor.normalize();
  }
  return { left, top };
}

export function insertPlainTextAtSelection(text: string) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStart(textNode, text.length);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function isMentionDelimiter(value: string) {
  return value === '' || /[\s.,;:!?)}\]"']/.test(value);
}

function appendChipContent(
  chip: HTMLSpanElement,
  formatted: ReturnType<typeof formatTextPromptVariableParts>,
) {
  if (formatted.sourceText) {
    const source = document.createElement('strong');
    source.textContent = formatted.sourceText;
    chip.appendChild(source);
  }
  if (formatted.sourceText && formatted.valueText) {
    const separator = document.createElement('span');
    separator.className = 'text-prompt-variable-chip-separator';
    separator.textContent = ':';
    chip.appendChild(separator);
  }
  if (formatted.valueText) {
    const valueText = document.createElement('span');
    valueText.textContent = formatted.valueText;
    chip.appendChild(valueText);
  }
}

function findDomPositionForRawOffset(root: Node, rawOffset: number) {
  let consumed = 0;
  let fallback = { node: root, offset: root.childNodes.length };
  const visit = (node: Node): { node: Node; offset: number } | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0;
      if (rawOffset <= consumed + length) return { node, offset: Math.max(0, rawOffset - consumed) };
      consumed += length;
      fallback = { node, offset: length };
      return null;
    }
    if (node instanceof HTMLElement && node.dataset.mentionAlias) {
      const length = getTextPromptMentionToken(node.dataset.mentionAlias).length;
      const parent = node.parentNode ?? root;
      const index = Array.prototype.indexOf.call(parent.childNodes, node) as number;
      if (rawOffset <= consumed) return { node: parent, offset: index };
      if (rawOffset <= consumed + length) return { node: parent, offset: index + 1 };
      consumed += length;
      fallback = { node: parent, offset: index + 1 };
      return null;
    }
    for (const child of Array.from(node.childNodes)) {
      const position = visit(child);
      if (position) return position;
    }
    return null;
  };
  return visit(root) ?? fallback;
}
