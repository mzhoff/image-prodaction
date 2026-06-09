'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { $forEachSelectedTextNode, $patchStyleText } from '@lexical/selection';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  $setSelection,
  type LexicalEditor,
  type RangeSelection,
  type TextFormatType,
} from 'lexical';
import { TELEGRAM_TEXT_FORMAT, TELEGRAM_TEXT_STYLE } from '../lib/telegram-rich-text';
import { FLOATING_CONTEXT_MENU_CLOSE_EVENT } from '@/shared/ui/floating-context-menu';

interface TelegramContextMenuState {
  x: number;
  y: number;
}

interface TelegramLinkDialogState {
  x: number;
  y: number;
  url: string;
}

type ClipboardTextState = 'empty' | 'has-text' | 'unknown';
export type TelegramTextContextMenuFeature =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'code'
  | 'link'
  | 'quote'
  | 'spoiler'
  | 'case';

const ALL_CONTEXT_MENU_FEATURES: TelegramTextContextMenuFeature[] = [
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'code',
  'link',
  'quote',
  'spoiler',
  'case',
];

const LEXICAL_TEXT_FORMAT_MASK: Partial<Record<TextFormatType, number>> = {
  bold: TELEGRAM_TEXT_FORMAT.bold,
  code: TELEGRAM_TEXT_FORMAT.code,
  italic: TELEGRAM_TEXT_FORMAT.italic,
  strikethrough: TELEGRAM_TEXT_FORMAT.strike,
  underline: TELEGRAM_TEXT_FORMAT.underline,
};

export function TelegramTextContextMenuPlugin({ features = ALL_CONTEXT_MENU_FEATURES }: { features?: readonly TelegramTextContextMenuFeature[] }) {
  const [editor] = useLexicalComposerContext();
  const featureSet = useMemo(() => new Set(features), [features]);
  const savedSelectionRef = useRef<RangeSelection | null>(null);
  const [clipboardTextState, setClipboardTextState] = useState<ClipboardTextState>('unknown');
  const [linkDialog, setLinkDialog] = useState<TelegramLinkDialogState | null>(null);
  const [menu, setMenu] = useState<TelegramContextMenuState | null>(null);

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return undefined;

    const handleContextMenu = (event: MouseEvent) => {
      let hasSelectedText = false;
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        hasSelectedText = Boolean($isRangeSelection(selection) && !selection.isCollapsed() && selection.getTextContent().trim());
      });

      if (!hasSelectedText) {
        setMenu(null);
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setMenu(getMenuPosition(event.clientX, event.clientY));
      setClipboardTextState('unknown');
      void readClipboardText().then((text) => {
        if (text === null) {
          setClipboardTextState('unknown');
          return;
        }
        setClipboardTextState(text.trim() ? 'has-text' : 'empty');
      });
    };

    root.addEventListener('contextmenu', handleContextMenu);
    return () => root.removeEventListener('contextmenu', handleContextMenu);
  }, [editor]);

  useEffect(() => {
    if (!menu && !linkDialog) return undefined;

    const closeFloatingUi = () => {
      setMenu(null);
      setLinkDialog(null);
      savedSelectionRef.current = null;
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.telegram-editor-context-menu, .telegram-editor-link-popover')) return;
      closeFloatingUi();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeFloatingUi();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', closeFloatingUi, true);
    document.addEventListener(FLOATING_CONTEXT_MENU_CLOSE_EVENT, closeFloatingUi);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', closeFloatingUi, true);
      document.removeEventListener(FLOATING_CONTEXT_MENU_CLOSE_EVENT, closeFloatingUi);
    };
  }, [linkDialog, menu]);

  if ((!menu && !linkDialog) || typeof document === 'undefined') return null;

  const runAction = (action: () => void | Promise<void>) => {
    void Promise.resolve(action()).finally(() => {
      editor.focus();
    });
    setMenu(null);
  };

  const openLinkDialog = () => {
    if (!menu) return;
    savedSelectionRef.current = getSelectedRangeClone(editor);
    setLinkDialog({ ...getLinkDialogPosition(menu.x, menu.y), url: '' });
    setMenu(null);
  };

  return (
    <>
      {menu ? createPortal(
        <div
          className="telegram-editor-context-menu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => event.stopPropagation()}
          data-node-interactive
          data-floating-context-menu="true"
        >
          <TelegramContextMenuButton label="Копировать" shortcut="⌘C" onClick={() => runAction(() => copySelectedText(editor))} />
          <TelegramContextMenuButton label="Вырезать" shortcut="⌘X" onClick={() => runAction(() => cutSelectedText(editor))} />
          <TelegramContextMenuButton
            label="Вставить"
            shortcut="⌘V"
            disabled={clipboardTextState === 'empty'}
            onClick={() => runAction(() => pasteClipboardText(editor))}
          />
          <div className="telegram-editor-context-menu-separator" />
          <TelegramContextMenuButton label="Убрать форматирование" onClick={() => runAction(() => removeSelectedFormatting(editor))} />
          <div className="telegram-editor-context-menu-separator" />
          {featureSet.has('strikethrough') ? <TelegramContextMenuButton label="Зачёркнутый" shortcut="⇧⌘X" onClick={() => runAction(() => applyTextFormat(editor, 'strikethrough'))} /> : null}
          {featureSet.has('underline') ? <TelegramContextMenuButton label="Подчёркнутый" shortcut="⇧⌘U" onClick={() => runAction(() => applyTextFormat(editor, 'underline'))} /> : null}
          {featureSet.has('spoiler') ? <TelegramContextMenuButton label="Скрытый" shortcut="⇧⌘P" onClick={() => runAction(() => applyTelegramStyle(editor, TELEGRAM_TEXT_STYLE.spoiler, '1'))} /> : null}
          {featureSet.has('code') ? <TelegramContextMenuButton label="Моноширинный" shortcut="⇧⌘K" onClick={() => runAction(() => applyTextFormat(editor, 'code'))} /> : null}
          {featureSet.has('italic') ? <TelegramContextMenuButton label="Курсив" shortcut="⌘I" onClick={() => runAction(() => applyTextFormat(editor, 'italic'))} /> : null}
          {featureSet.has('bold') ? <TelegramContextMenuButton label="Жирный" shortcut="⌘B" onClick={() => runAction(() => applyTextFormat(editor, 'bold'))} /> : null}
          {featureSet.has('link') ? <TelegramContextMenuButton label="Добавить ссылку" shortcut="⌘U" onClick={openLinkDialog} /> : null}
          {featureSet.has('quote') ? <TelegramContextMenuButton label="Цитата" shortcut="⇧⌘I" onClick={() => runAction(() => applyTelegramStyle(editor, TELEGRAM_TEXT_STYLE.quote, '1'))} /> : null}
          {featureSet.has('case') ? <div className="telegram-editor-context-menu-separator" /> : null}
          {featureSet.has('case') ? <TelegramContextMenuButton label="Прописные" prefix="АБВ" onClick={() => runAction(() => transformSelectedText(editor, (text) => text.toLocaleUpperCase()))} /> : null}
          {featureSet.has('case') ? <TelegramContextMenuButton label="Строчные" prefix="абв" onClick={() => runAction(() => transformSelectedText(editor, (text) => text.toLocaleLowerCase()))} /> : null}
          {featureSet.has('case') ? <TelegramContextMenuButton label="С заглавной буквы" prefix="Абв" onClick={() => runAction(() => transformSelectedText(editor, capitalizeText))} /> : null}
        </div>,
        document.body,
      ) : null}
      {linkDialog ? createPortal(
        <TelegramLinkPopover
          dialog={linkDialog}
          onCancel={() => {
            setLinkDialog(null);
            savedSelectionRef.current = null;
          }}
          onSubmit={(url) => {
            applyLink(editor, url, savedSelectionRef.current);
            savedSelectionRef.current = null;
            setLinkDialog(null);
            editor.focus();
          }}
        />,
        document.body,
      ) : null}
    </>
  );
}

function TelegramContextMenuButton({
  label,
  onClick,
  disabled = false,
  prefix,
  shortcut,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  prefix?: string;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      className="telegram-editor-context-menu-item"
      disabled={disabled}
      onClick={onClick}
      data-node-interactive
      data-floating-context-menu="true"
    >
      <span className={prefix ? 'telegram-editor-context-menu-prefix' : 'telegram-editor-context-menu-prefix telegram-editor-context-menu-prefix-empty'}>{prefix}</span>
      <span>{label}</span>
      {shortcut ? <kbd>{shortcut}</kbd> : null}
    </button>
  );
}

function TelegramLinkPopover({
  dialog,
  onCancel,
  onSubmit,
}: {
  dialog: TelegramLinkDialogState;
  onCancel: () => void;
  onSubmit: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [url, setUrl] = useState(dialog.url);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <form
      className="telegram-editor-link-popover"
      style={{ left: dialog.x, top: dialog.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault();
        const normalizedUrl = normalizeLinkUrl(url);
        if (!normalizedUrl) return;
        onSubmit(normalizedUrl);
      }}
      data-node-interactive
    >
      <label htmlFor="telegram-editor-link-input">Ссылка</label>
      <input
        id="telegram-editor-link-input"
        ref={inputRef}
        type="url"
        inputMode="url"
        value={url}
        placeholder="https://example.com"
        onChange={(event) => setUrl(event.target.value)}
      />
      <div className="telegram-editor-link-actions">
        <button type="button" onClick={onCancel}>Отмена</button>
        <button type="submit">Применить</button>
      </div>
    </form>
  );
}

function applyTextFormat(editor: LexicalEditor, format: TextFormatType) {
  const mask = LEXICAL_TEXT_FORMAT_MASK[format];
  if (!mask) return;

  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || selection.isCollapsed()) return;

    $forEachSelectedTextNode((textNode) => {
      textNode.setFormat(textNode.getFormat() | mask);
    });
    selection.setFormat(selection.format | mask);
  });
}

function applyTelegramStyle(editor: LexicalEditor, property: string, value: string, savedSelection?: RangeSelection | null) {
  editor.update(() => {
    restoreSelection(savedSelection);
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || selection.isCollapsed()) return;
    $patchStyleText(selection, { [property]: value });
  });
}

function applyLink(editor: LexicalEditor, url: string, savedSelection?: RangeSelection | null) {
  applyTelegramStyle(editor, TELEGRAM_TEXT_STYLE.link, encodeURIComponent(url), savedSelection);
}

function copySelectedText(editor: LexicalEditor) {
  const text = getSelectedText(editor);
  if (!text) return;
  void writeClipboardText(text);
}

function cutSelectedText(editor: LexicalEditor) {
  const text = getSelectedText(editor);
  if (!text) return;

  void writeClipboardText(text);
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || selection.isCollapsed()) return;
    selection.removeText();
  });
}

async function pasteClipboardText(editor: LexicalEditor) {
  const text = await readClipboardText();
  if (!text) return;

  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    selection.insertText(text);
  });
}

function removeSelectedFormatting(editor: LexicalEditor) {
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

function getSelectedText(editor: LexicalEditor) {
  let text = '';
  editor.getEditorState().read(() => {
    const selection = $getSelection();
    text = $isRangeSelection(selection) && !selection.isCollapsed() ? selection.getTextContent() : '';
  });
  return text;
}

function getSelectedRangeClone(editor: LexicalEditor) {
  let clonedSelection: RangeSelection | null = null;
  editor.getEditorState().read(() => {
    const selection = $getSelection();
    clonedSelection = $isRangeSelection(selection) && !selection.isCollapsed() ? selection.clone() : null;
  });
  return clonedSelection;
}

function restoreSelection(selection: RangeSelection | null | undefined) {
  if (selection) $setSelection(selection.clone());
}

async function readClipboardText() {
  try {
    return await navigator.clipboard?.readText() ?? '';
  } catch {
    return null;
  }
}

async function writeClipboardText(text: string) {
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    // Clipboard permissions vary by browser; formatting commands should not fail because of that.
  }
}

function transformSelectedText(editor: LexicalEditor, transform: (text: string) => string) {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || selection.isCollapsed()) return;

    $forEachSelectedTextNode((textNode) => {
      textNode.setTextContent(transform(textNode.getTextContent()));
    });
  });
}

function capitalizeText(value: string) {
  return value.toLocaleLowerCase().replace(/\p{L}[\p{L}\p{M}]*/gu, (word) => {
    const [firstCharacter = '', ...rest] = Array.from(word);
    return `${firstCharacter.toLocaleUpperCase()}${rest.join('')}`;
  });
}

function normalizeLinkUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function getMenuPosition(x: number, y: number): TelegramContextMenuState {
  const width = 278;
  const height = 480;
  return {
    x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - width - 8)),
    y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - height - 8)),
  };
}

function getLinkDialogPosition(x: number, y: number): TelegramLinkDialogState {
  const width = 292;
  const height = 126;
  return {
    x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - width - 8)),
    y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - height - 8)),
    url: '',
  };
}
