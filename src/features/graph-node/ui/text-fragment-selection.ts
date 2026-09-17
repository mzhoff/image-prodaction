import { readEditorValue } from './text-prompt-variable-editor-dom';

/** Translate a real DOM selection to the stored string, never indexOf(selectedText). */
export function selectedFragmentRange(editor: HTMLElement, expected: string): { start: number; end: number } | null {
  if (editor instanceof HTMLTextAreaElement) {
    return editor.value === expected ? { start: editor.selectionStart, end: editor.selectionEnd } : null;
  }
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return null;
  const serialize = (root: Node) => editor.classList.contains('text-prompt-variable-content')
    ? readEditorValue(root) : readParagraphs(root);
  const full = serialize(editor);
  const prefix = range.cloneRange();
  prefix.selectNodeContents(editor);
  prefix.setEnd(range.startContainer, range.startOffset);
  const start = serialize(prefix.cloneContents()).length;
  prefix.setEnd(range.endContainer, range.endOffset);
  const end = serialize(prefix.cloneContents()).length;
  if (full === expected) return { start, end };
  // Lexical normalizes blank lines and NBSP. Map by character order, not by an
  // ambiguous substring search. If content differs beyond whitespace, abort.
  const domChars = [...full.matchAll(/\S/g)];
  const rawChars = [...expected.matchAll(/\S/g)];
  if (domChars.length !== rawChars.length || domChars.some((char, index) => char[0] !== rawChars[index][0])) return null;
  const first = domChars.findIndex((char) => char.index! >= start);
  const last = domChars.findLastIndex((char) => char.index! < end);
  return first >= 0 && last >= first ? { start: rawChars[first].index!, end: rawChars[last].index! + 1 } : null;
}

function readParagraphs(root: Node): string {
  return Array.from(root.childNodes).map((node, index, siblings) => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (node instanceof HTMLBRElement) return '\n';
    const text = readParagraphs(node);
    return text + (node instanceof HTMLParagraphElement && index < siblings.length - 1 ? '\n\n' : '');
  }).join('');
}
