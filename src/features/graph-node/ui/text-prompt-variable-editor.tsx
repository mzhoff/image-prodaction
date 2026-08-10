'use client';

import { Plus } from 'lucide-react';
import type { CSSProperties, ClipboardEvent, KeyboardEvent, WheelEvent } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TextPromptVariableDisplayMode, TextPromptVariable } from '@/entities/production-graph/model/types';
import { cn } from '@/shared/lib/cn';
import { useScrollableWheel } from '@/shared/ui/use-scrollable-wheel';
import { getTextPromptMentionToken, splitTextPromptMentionTokens } from '../lib/text-prompt-variables';
import {
  getActiveMention,
  getEditorCaretPoint,
  getSelectionRawOffset,
  insertPlainTextAtSelection,
  isMentionDelimiter,
  readEditorValue,
  renderEditorContent,
  setCaretByRawOffset,
  type ActiveMention,
  type TextPromptVariableEditorSlot,
} from './text-prompt-variable-editor-dom';

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
