import { $forEachSelectedTextNode, $patchStyleText } from '@lexical/selection';
import {
  $getSelection,
  $isRangeSelection,
  $setSelection,
  type LexicalEditor,
  type RangeSelection,
  type TextFormatType,
} from 'lexical';
import { TELEGRAM_TEXT_FORMAT, TELEGRAM_TEXT_STYLE } from '../lib/telegram-rich-text';

const LEXICAL_TEXT_FORMAT_MASK: Partial<Record<TextFormatType, number>> = {
  bold: TELEGRAM_TEXT_FORMAT.bold,
  code: TELEGRAM_TEXT_FORMAT.code,
  italic: TELEGRAM_TEXT_FORMAT.italic,
  strikethrough: TELEGRAM_TEXT_FORMAT.strike,
  underline: TELEGRAM_TEXT_FORMAT.underline,
};

export function applyTextFormat(editor: LexicalEditor, format: TextFormatType) {
  const mask = LEXICAL_TEXT_FORMAT_MASK[format];
  if (!mask) return;
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || selection.isCollapsed()) return;
    $forEachSelectedTextNode((textNode) => textNode.setFormat(textNode.getFormat() | mask));
    selection.setFormat(selection.format | mask);
  });
}

export function applyTelegramStyle(
  editor: LexicalEditor,
  property: string,
  value: string,
  savedSelection?: RangeSelection | null,
) {
  editor.update(() => {
    restoreSelection(savedSelection);
    const selection = $getSelection();
    if ($isRangeSelection(selection) && !selection.isCollapsed()) $patchStyleText(selection, { [property]: value });
  });
}

export function applyLink(editor: LexicalEditor, url: string, savedSelection?: RangeSelection | null) {
  applyTelegramStyle(editor, TELEGRAM_TEXT_STYLE.link, encodeURIComponent(url), savedSelection);
}

export function copySelectedText(editor: LexicalEditor) {
  const text = getSelectedText(editor);
  if (text) void writeClipboardText(text);
}

export function cutSelectedText(editor: LexicalEditor) {
  const text = getSelectedText(editor);
  if (!text) return;
  void writeClipboardText(text);
  editor.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection) && !selection.isCollapsed()) selection.removeText();
  });
}

export async function pasteClipboardText(editor: LexicalEditor) {
  const text = await readClipboardText();
  if (!text) return;
  editor.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) selection.insertText(text);
  });
}

export function removeSelectedFormatting(editor: LexicalEditor) {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || selection.isCollapsed()) return;
    selection.setFormat(0);
    selection.setStyle('');
    $forEachSelectedTextNode((textNode) => {
      textNode.setFormat(0);
      textNode.setStyle('');
    });
  });
}

export function getSelectedRangeClone(editor: LexicalEditor) {
  let clonedSelection: RangeSelection | null = null;
  editor.getEditorState().read(() => {
    const selection = $getSelection();
    clonedSelection = $isRangeSelection(selection) && !selection.isCollapsed() ? selection.clone() : null;
  });
  return clonedSelection;
}

export async function readClipboardText() {
  try {
    return await navigator.clipboard?.readText() ?? '';
  } catch {
    return null;
  }
}

export function transformSelectedText(editor: LexicalEditor, transform: (text: string) => string) {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || selection.isCollapsed()) return;
    $forEachSelectedTextNode((textNode) => textNode.setTextContent(transform(textNode.getTextContent())));
  });
}

export function capitalizeText(value: string) {
  return value.toLocaleLowerCase().replace(/\p{L}[\p{L}\p{M}]*/gu, (word) => {
    const [firstCharacter = '', ...rest] = Array.from(word);
    return `${firstCharacter.toLocaleUpperCase()}${rest.join('')}`;
  });
}

export function normalizeLinkUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  return /^(https?:|mailto:|tel:)/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function getMenuPosition(x: number, y: number) {
  return getFloatingPosition(x, y, 278, 480);
}

export function getLinkDialogPosition(x: number, y: number) {
  return { ...getFloatingPosition(x, y, 292, 126), url: '' };
}

function getSelectedText(editor: LexicalEditor) {
  let text = '';
  editor.getEditorState().read(() => {
    const selection = $getSelection();
    text = $isRangeSelection(selection) && !selection.isCollapsed() ? selection.getTextContent() : '';
  });
  return text;
}

function restoreSelection(selection: RangeSelection | null | undefined) {
  if (selection) $setSelection(selection.clone());
}

async function writeClipboardText(text: string) {
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    // Clipboard permissions vary by browser; formatting commands should not fail because of that.
  }
}

function getFloatingPosition(x: number, y: number, width: number, height: number) {
  return {
    x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - width - 8)),
    y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - height - 8)),
  };
}
