'use client';

import { Plus } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { UIEvent } from 'react';
import { useMemo, useRef, useState } from 'react';
import type { TextPromptVariableDisplayMode, TextPromptVariable } from '@/entities/production-graph/model/types';
import { cn } from '@/shared/lib/cn';
import { getTextPromptMentionToken, splitTextPromptMentionTokens } from '../lib/text-prompt-variables';

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
  placeholder = 'Write prompt. Type @ to insert a variable.',
  slots,
  style,
  value,
}: TextPromptVariableEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const [activeMention, setActiveMention] = useState<ActiveMention | null>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 12, top: 36 });
  const tokens = useMemo(() => splitTextPromptMentionTokens(value, slots, displayMode), [displayMode, slots, value]);
  const filteredSlots = useMemo(() => {
    if (!activeMention) return slots;
    const query = activeMention.query.toLowerCase();
    return slots.filter((slot) => slot.alias.toLowerCase().includes(query));
  }, [activeMention, slots]);
  const menuOpen = Boolean(activeMention && (filteredSlots.length > 0 || canAddVariable));

  const updateMentionState = (textarea: HTMLTextAreaElement, nextValue = textarea.value) => {
    const nextMention = getActiveMention(nextValue, textarea.selectionStart);
    setActiveMention(nextMention);
    if (nextMention) setMenuPosition(getTextareaCaretPoint(textarea, textarea.selectionStart));
  };

  const insertMention = (alias: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const mention = activeMention ?? { start: textarea.selectionStart, end: textarea.selectionEnd, query: '' };
    const before = value.slice(0, mention.start);
    const after = value.slice(mention.end);
    const token = getTextPromptMentionToken(alias);
    const nextValue = `${before}${token}${after}`;
    const cursor = before.length + token.length;
    onChange(nextValue);
    setActiveMention(null);
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const handleAddVariableFromMenu = () => {
    const variable = onAddVariable();
    if (variable) insertMention(variable.alias);
  };

  const handleScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = textarea.scrollTop;
      highlightRef.current.scrollLeft = textarea.scrollLeft;
    }
    if (activeMention) setMenuPosition(getTextareaCaretPoint(textarea, textarea.selectionStart));
  };

  return (
    <div className={cn('text-prompt-variable-editor', className)} style={style} data-node-interactive>
      <div ref={highlightRef} className="text-prompt-variable-highlight" aria-hidden="true">
        {value ? tokens.map((token, index) => (
          token.type === 'mention'
            ? (
              <span key={`${token.alias}-${index}`} className="text-prompt-variable-chip">
                {token.sourceText ? <strong>{token.sourceText}</strong> : null}
                {token.sourceText && token.valueText ? <span className="text-prompt-variable-chip-separator">:</span> : null}
                {token.valueText ? <span>{token.valueText}</span> : null}
              </span>
            )
            : <span key={`text-${index}`}>{token.text}</span>
        )) : <span className="text-prompt-variable-placeholder">{placeholder}</span>}
      </div>
      <textarea
        ref={textareaRef}
        className="text-prompt-variable-textarea"
        value={value}
        onBlur={() => window.setTimeout(() => setActiveMention(null), 120)}
        onChange={(event) => {
          onChange(event.target.value);
          updateMentionState(event.target, event.target.value);
        }}
        onClick={(event) => updateMentionState(event.currentTarget)}
        onKeyUp={(event) => updateMentionState(event.currentTarget)}
        onScroll={handleScroll}
        placeholder={placeholder}
        spellCheck={false}
      />
      {menuOpen ? (
        <div
          className="text-prompt-variable-menu"
          style={{ left: menuPosition.left, top: menuPosition.top }}
          onMouseDown={(event) => event.preventDefault()}
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
        </div>
      ) : null}
    </div>
  );
}

function getActiveMention(value: string, cursor: number): ActiveMention | null {
  const before = value.slice(0, cursor);
  const match = before.match(/(^|[\s([{])@([^\s@]*)$/);
  if (!match) return null;
  const query = match[2] ?? '';
  const start = before.length - query.length - 1;
  return { start, end: cursor, query };
}

function getTextareaCaretPoint(textarea: HTMLTextAreaElement, position: number) {
  const mirror = document.createElement('div');
  const style = window.getComputedStyle(textarea);
  const properties = [
    'borderBottomWidth',
    'borderLeftWidth',
    'borderRightWidth',
    'borderTopWidth',
    'boxSizing',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'letterSpacing',
    'lineHeight',
    'paddingBottom',
    'paddingLeft',
    'paddingRight',
    'paddingTop',
    'textTransform',
    'whiteSpace',
    'wordBreak',
    'wordSpacing',
  ] as const;

  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.overflow = 'hidden';
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordBreak = 'break-word';
  properties.forEach((property) => {
    mirror.style[property] = style[property];
  });
  mirror.textContent = textarea.value.slice(0, position);
  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const left = Math.min(Math.max(marker.offsetLeft - textarea.scrollLeft, 10), textarea.clientWidth - 180);
  const top = Math.min(Math.max(marker.offsetTop - textarea.scrollTop + 22, 30), textarea.clientHeight - 20);
  document.body.removeChild(mirror);
  return { left, top };
}
