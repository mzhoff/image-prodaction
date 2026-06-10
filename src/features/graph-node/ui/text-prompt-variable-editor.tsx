'use client';

import { Plus } from 'lucide-react';
import type { CSSProperties, ClipboardEvent, KeyboardEvent, WheelEvent } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TextPromptVariableDisplayMode, TextPromptVariable } from '@/entities/production-graph/model/types';
import { cn } from '@/shared/lib/cn';
import { useScrollableWheel } from '@/shared/ui/use-scrollable-wheel';
import { formatTextPromptVariableParts, getTextPromptMentionToken, splitTextPromptMentionTokens } from '../lib/text-prompt-variables';

interface TextPromptVariableEditorSlot {
  alias: string;
  mentionAliases?: string[];
  portId: string;
  value: string;
}

interface TextPromptVariableEditorProps {
  canAddVariable: boolean;
  className?: string;
  displayMode: TextPromptVariableDisplayMode;
  onAddVariable: () => TextPromptVariable | undefined;
  onChange: (value: string) => void;
  onRedo?: () => void;
  onUndo?: () => void;
  placeholder?: string;
  slots: TextPromptVariableEditorSlot[];
  style?: CSSProperties;
  value: string;
}

interface ActiveMention {
  end: number;
  query: string;
  start: number;
}

export function TextPromptVariableEditor({
  canAddVariable,
  className,
  displayMode,
  onAddVariable,
  onChange,
  onRedo,
  onUndo,
  placeholder = 'Write prompt. Type @ to insert a variable.',
  slots,
  style,
  value,
}: TextPromptVariableEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const pendingCaretOffsetRef = useRef<number | null>(null);
  const [activeMention, setActiveMention] = useState<ActiveMention | null>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });
  const [menuPortalRoot, setMenuPortalRoot] = useState<HTMLElement | null>(null);
  const handleWheel = useScrollableWheel<HTMLDivElement>();
  const tokens = useMemo(() => splitTextPromptMentionTokens(value, slots, displayMode), [displayMode, slots, value]);
  const filteredSlots = useMemo(() => {
    if (!activeMention) return slots;
    const query = activeMention.query.toLowerCase();
    return slots.filter((slot) => slot.alias.toLowerCase().includes(query));
  }, [activeMention, slots]);
  const menuOpen = Boolean(activeMention && (filteredSlots.length > 0 || canAddVariable));

  const updateMentionMenuPosition = useCallback((editor = editorRef.current) => {
    if (!editor) return;
    setMenuPosition(getEditorCaretPoint(editor));
  }, []);

  useEffect(() => {
    setMenuPortalRoot(document.body);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const updatePosition = () => updateMentionMenuPosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [menuOpen, updateMentionMenuPosition]);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const shouldRestoreCaret = document.activeElement === editor;
    const caretOffset = pendingCaretOffsetRef.current ?? (shouldRestoreCaret ? getSelectionRawOffset(editor) : null);
    pendingCaretOffsetRef.current = null;

    renderEditorContent(editor, tokens, slots, displayMode);

    if (shouldRestoreCaret && caretOffset !== null) {
      setCaretByRawOffset(editor, Math.min(caretOffset, value.length));
    }
  }, [displayMode, slots, tokens, value]);

  const updateMentionState = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const cursor = getSelectionRawOffset(editor);
    const nextMention = getActiveMention(readEditorValue(editor), cursor);
    setActiveMention(nextMention);
    if (nextMention) updateMentionMenuPosition(editor);
  };

  const syncValueFromEditor = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextValue = readEditorValue(editor);
    pendingCaretOffsetRef.current = getSelectionRawOffset(editor);
    onChange(nextValue);
    const nextMention = getActiveMention(nextValue, pendingCaretOffsetRef.current);
    setActiveMention(nextMention);
    if (nextMention) updateMentionMenuPosition(editor);
  };

  const insertMention = (alias: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const rawValue = readEditorValue(editor);
    const cursor = getSelectionRawOffset(editor);
    const mention = activeMention ?? { start: cursor, end: cursor, query: '' };
    const before = rawValue.slice(0, mention.start);
    const after = rawValue.slice(mention.end);
    const token = getTextPromptMentionToken(alias);
    const suffix = after.length === 0 || !isMentionDelimiter(after[0] ?? '') ? ' ' : '';
    const nextValue = `${before}${token}${suffix}${after}`;
    const nextCaret = before.length + token.length + suffix.length;
    pendingCaretOffsetRef.current = nextCaret;
    onChange(nextValue);
    setActiveMention(null);
    window.requestAnimationFrame(() => {
      editor.focus();
      setCaretByRawOffset(editor, nextCaret);
    });
  };

  const handleAddVariableFromMenu = () => {
    const variable = onAddVariable();
    if (variable) insertMention(variable.alias);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const isMod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();

    if (isMod && key === 'z') {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) {
        onRedo?.();
      } else {
        onUndo?.();
      }
      return;
    }

    if (isMod && key === 'y') {
      event.preventDefault();
      event.stopPropagation();
      onRedo?.();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      insertPlainTextAtSelection('\n');
      syncValueFromEditor();
      return;
    }

    if (event.key === 'Tab' && activeMention && filteredSlots[0]) {
      event.preventDefault();
      insertMention(filteredSlots[0].alias);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    insertPlainTextAtSelection(event.clipboardData.getData('text/plain'));
    syncValueFromEditor();
  };

  const handleEditorScroll = () => {
    if (activeMention) updateMentionMenuPosition();
  };

  const handleEditorWheel = (event: WheelEvent<HTMLDivElement>) => {
    handleWheel(event);
    if (activeMention) window.requestAnimationFrame(() => updateMentionMenuPosition());
  };

  return (
    <div className={cn('text-prompt-variable-editor', className)} style={style} data-node-interactive>
      <div
        ref={editorRef}
        className="text-prompt-variable-content"
        contentEditable
        data-canvas-wheel-scroll="true"
        data-placeholder={placeholder}
        role="textbox"
        aria-label={placeholder}
        aria-multiline="true"
        spellCheck={false}
        suppressContentEditableWarning
        onBlur={() => window.setTimeout(() => setActiveMention(null), 120)}
        onClick={updateMentionState}
        onInput={syncValueFromEditor}
        onKeyDown={handleKeyDown}
        onKeyUp={updateMentionState}
        onPaste={handlePaste}
        onScroll={handleEditorScroll}
        onWheelCapture={handleEditorWheel}
      />
      {menuOpen && menuPortalRoot ? createPortal(
        <div
          className="text-prompt-variable-menu"
          style={{ left: menuPosition.left, top: menuPosition.top }}
          data-node-interactive
          onMouseDown={(event) => event.preventDefault()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {filteredSlots.map((slot) => (
            <button key={slot.portId} type="button" onClick={() => insertMention(slot.alias)}>
              <strong>{slot.alias}</strong>
              <span>{slot.value || 'None'}</span>
            </button>
          ))}
          {canAddVariable ? (
            <button type="button" className="text-prompt-variable-menu-add" onClick={handleAddVariableFromMenu}>
              <Plus size={14} />
              <span>Add variable</span>
            </button>
          ) : null}
        </div>,
        menuPortalRoot,
      ) : null}
    </div>
  );
}

function renderEditorContent(
  editor: HTMLDivElement,
  tokens: ReturnType<typeof splitTextPromptMentionTokens>,
  slots: TextPromptVariableEditorSlot[],
  displayMode: TextPromptVariableDisplayMode,
) {
  const fragment = document.createDocumentFragment();

  tokens.forEach((token) => {
    if (token.type === 'text') {
      if (token.text) fragment.appendChild(document.createTextNode(token.text));
      return;
    }

    const slot = slots.find((item) => item.alias === token.alias || item.mentionAliases?.includes(token.alias));
    const alias = slot?.alias ?? token.alias;
    const chip = document.createElement('span');
    chip.className = 'text-prompt-variable-chip';
    chip.contentEditable = 'false';
    chip.dataset.mentionAlias = alias;

    const formatted = formatTextPromptVariableParts(alias, slot?.value ?? token.value, displayMode);
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

    fragment.appendChild(chip);
  });

  editor.replaceChildren(fragment);
}

function readEditorValue(root: Node) {
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

function getActiveMention(value: string, cursor: number): ActiveMention | null {
  const before = value.slice(0, cursor);
  const match = before.match(/(^|[\s([{])@([^\s@]*)$/);
  if (!match) return null;
  const query = match[2] ?? '';
  const start = before.length - query.length - 1;
  return { start, end: cursor, query };
}

function getSelectionRawOffset(editor: HTMLDivElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return readEditorValue(editor).length;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.endContainer)) return readEditorValue(editor).length;

  const prefixRange = document.createRange();
  prefixRange.selectNodeContents(editor);
  prefixRange.setEnd(range.endContainer, range.endOffset);
  return readEditorValue(prefixRange.cloneContents()).length;
}

function setCaretByRawOffset(editor: HTMLDivElement, rawOffset: number) {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  const position = findDomPositionForRawOffset(editor, rawOffset);
  range.setStart(position.node, position.offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function findDomPositionForRawOffset(root: Node, rawOffset: number) {
  let consumed = 0;
  let fallback = { node: root, offset: root.childNodes.length };

  const visit = (node: Node): { node: Node; offset: number } | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0;
      if (rawOffset <= consumed + length) {
        return { node, offset: Math.max(0, rawOffset - consumed) };
      }
      consumed += length;
      fallback = { node, offset: length };
      return null;
    }

    if (node instanceof HTMLElement && node.dataset.mentionAlias) {
      const length = getTextPromptMentionToken(node.dataset.mentionAlias).length;
      const parent = node.parentNode ?? root;
      const index = Array.prototype.indexOf.call(parent.childNodes, node);
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

function getEditorCaretPoint(editor: HTMLDivElement) {
  const selection = window.getSelection();
  const editorRect = editor.getBoundingClientRect();
  if (!selection || selection.rangeCount === 0) return { left: editorRect.left + 10, top: editorRect.top + 30 };
  if (!selection.focusNode || !editor.contains(selection.focusNode)) {
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

  const viewportMargin = 8;
  const menuWidth = 178;
  const estimatedMenuHeight = 240;
  const caretGap = 6;
  const caretLeft = rect.left || editorRect.left + 10;
  const caretTop = rect.top || editorRect.top + 10;
  const caretBottom = rect.bottom || caretTop + 16;
  const maxLeft = window.innerWidth - menuWidth - viewportMargin;
  const left = Math.min(Math.max(caretLeft, viewportMargin), Math.max(viewportMargin, maxLeft));
  const belowTop = caretBottom + caretGap;
  const shouldFlipAbove = belowTop + estimatedMenuHeight > window.innerHeight - viewportMargin;
  const preferredTop = shouldFlipAbove ? caretTop - estimatedMenuHeight - caretGap : belowTop;
  const top = Math.min(
    Math.max(preferredTop, viewportMargin),
    Math.max(viewportMargin, window.innerHeight - viewportMargin - 32),
  );

  if (marker) {
    const parent = marker.parentNode;
    parent?.removeChild(marker);
    editor.normalize();
  }

  return { left, top };
}

function insertPlainTextAtSelection(text: string) {
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

function isMentionDelimiter(value: string) {
  return value === '' || /[\s.,;:!?)}\]"']/.test(value);
}
