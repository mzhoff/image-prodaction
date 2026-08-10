'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import { $isListNode, INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND } from '@lexical/list';
import { $createHeadingNode, $createQuoteNode, $isHeadingNode,
  $isQuoteNode } from '@lexical/rich-text';
import type { HeadingTagType } from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import { $createParagraphNode, $findMatchingParent, $getSelection, $isRangeSelection,
  COMMAND_PRIORITY_LOW, FORMAT_TEXT_COMMAND, SELECTION_CHANGE_COMMAND } from 'lexical';
import type { TextFormatType } from 'lexical';
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Bold, Heading2, Heading3, Heading4, Italic, Link2, List,
  ListOrdered, Quote, Strikethrough, Underline } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { normalizeEditorUrl } from './article-rich-text-state';

const toolbarItems = [
  { format: 'bold', label: 'Bold', icon: Bold },
  { format: 'italic', label: 'Italic', icon: Italic },
  { format: 'underline', label: 'Underline', icon: Underline },
  { format: 'strikethrough', label: 'Strikethrough', icon: Strikethrough },
] as const satisfies ReadonlyArray<{
  format: TextFormatType; label: string; icon: typeof Bold;
}>;
type ToolbarFormat = (typeof toolbarItems)[number]['format'];
type ToolbarListType = 'bullet' | 'number';

export function FloatingSelectionToolbar({ fullscreen }: { fullscreen: boolean }) {
  const [editor] = useLexicalComposerContext();
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [activeFormats, setActiveFormats] = useState<Partial<Record<ToolbarFormat, boolean>>>({});
  const [activeHeading, setActiveHeading] = useState<HeadingTagType | null>(null);
  const [activeListType, setActiveListType] = useState<ToolbarListType | null>(null);
  const [isQuoteActive, setIsQuoteActive] = useState(false);
  const [isLinkActive, setIsLinkActive] = useState(false);

  const resetToolbar = useCallback(() => {
    setPosition(null); setActiveFormats({}); setActiveHeading(null);
    setActiveListType(null); setIsQuoteActive(false); setIsLinkActive(false);
  }, []);
  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    const nativeSelection = window.getSelection();
    const rootElement = editor.getRootElement();
    if (!$isRangeSelection(selection) || selection.isCollapsed() || !nativeSelection
      || nativeSelection.isCollapsed || nativeSelection.rangeCount === 0 || !rootElement
      || !nativeSelection.anchorNode || !rootElement.contains(nativeSelection.anchorNode)) {
      resetToolbar(); return;
    }
    const rangeRect = nativeSelection.getRangeAt(0).getBoundingClientRect();
    const shellRect = rootElement.closest<HTMLElement>('[data-editor-shell]')?.getBoundingClientRect();
    if (!shellRect || (rangeRect.width === 0 && rangeRect.height === 0)) {
      resetToolbar(); return;
    }
    setPosition(calculateToolbarPosition(rangeRect, shellRect, fullscreen));
    setActiveFormats({
      bold: selection.hasFormat('bold'), italic: selection.hasFormat('italic'),
      underline: selection.hasFormat('underline'),
      strikethrough: selection.hasFormat('strikethrough'),
    });
    const anchorNode = selection.anchor.getNode();
    const linkNode = $findMatchingParent(anchorNode, $isLinkNode);
    const blockNode = anchorNode.getKey() === 'root'
      ? anchorNode : anchorNode.getTopLevelElementOrThrow();
    const parentNode = blockNode.getParent();
    const listNode = $isListNode(blockNode) ? blockNode
      : $isListNode(parentNode) ? parentNode : null;
    const listType = listNode?.getListType();
    setActiveHeading($isHeadingNode(blockNode) ? blockNode.getTag() : null);
    setActiveListType(listType === 'bullet' || listType === 'number' ? listType : null);
    setIsQuoteActive($isQuoteNode(blockNode));
    setIsLinkActive(Boolean(linkNode) || $isLinkNode(anchorNode));
  }, [editor, fullscreen, resetToolbar]);

  useEffect(() => editor.registerUpdateListener(({ editorState }) => {
    editorState.read(updateToolbar);
  }), [editor, updateToolbar]);
  useEffect(() => editor.registerCommand(SELECTION_CHANGE_COMMAND, () => {
    updateToolbar(); return false;
  }, COMMAND_PRIORITY_LOW), [editor, updateToolbar]);
  useEffect(() => {
    const handleViewportChange = () => editor.getEditorState().read(updateToolbar);
    window.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);
    return () => {
      window.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [editor, updateToolbar]);

  const applyHeading = (tag: HeadingTagType) => editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    for (const item of toolbarItems) {
      if (selection.hasFormat(item.format)) selection.formatText(item.format);
    }
    $setBlocksType(selection, () => $createHeadingNode(tag));
  });
  const setParagraph = () => editor.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createParagraphNode());
  });
  const toggleQuote = () => editor.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) $setBlocksType(selection,
      () => isQuoteActive ? $createParagraphNode() : $createQuoteNode());
  });
  const toggleLink = () => {
    const rawUrl = window.prompt(isLinkActive
      ? 'Введите новую ссылку или оставьте пустой, чтобы снять ссылку.' : 'Введите ссылку.');
    if (rawUrl !== null) editor.dispatchCommand(TOGGLE_LINK_COMMAND,
      normalizeEditorUrl(rawUrl) || null);
  };
  const toggleList = (type: ToolbarListType) => {
    if (activeListType === type) {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined); return;
    }
    editor.dispatchCommand(type === 'bullet'
      ? INSERT_UNORDERED_LIST_COMMAND : INSERT_ORDERED_LIST_COMMAND, undefined);
  };
  if (!position) return null;
  return (
    <div className={cn('article-editor-floating-toolbar',
      fullscreen && 'article-editor-floating-toolbar-fullscreen')}
      data-node-interactive style={{ top: position.top, left: position.left,
        transform: 'translateX(-50%)' }}>
      <ToolbarButton label="Paragraph" text="P" onClick={setParagraph} />
      <ToolbarButton label="Heading 2" icon={<Heading2 size={14} />}
        active={activeHeading === 'h2'} onClick={() => applyHeading('h2')} />
      <ToolbarButton label="Heading 3" icon={<Heading3 size={14} />}
        active={activeHeading === 'h3'} onClick={() => applyHeading('h3')} />
      <ToolbarButton label="Heading 4" icon={<Heading4 size={14} />}
        active={activeHeading === 'h4'} onClick={() => applyHeading('h4')} />
      <ToolbarDivider />
      {toolbarItems.map((item) => { const Icon = item.icon; return (
        <ToolbarButton key={item.format} label={item.label} icon={<Icon size={14} />}
          active={activeFormats[item.format] ?? false}
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, item.format)} />
      ); })}
      <ToolbarDivider />
      <ToolbarButton label="Link" icon={<Link2 size={14} />} active={isLinkActive} onClick={toggleLink} />
      <ToolbarButton label="Bullet list" icon={<List size={14} />}
        active={activeListType === 'bullet'} onClick={() => toggleList('bullet')} />
      <ToolbarButton label="Numbered list" icon={<ListOrdered size={14} />}
        active={activeListType === 'number'} onClick={() => toggleList('number')} />
      <ToolbarButton label="Quote" icon={<Quote size={14} />}
        active={isQuoteActive} onClick={toggleQuote} />
    </div>
  );
}

function calculateToolbarPosition(range: DOMRect, shell: DOMRect, fullscreen: boolean) {
  const height = fullscreen ? 44 : 40;
  const width = fullscreen ? 560 : 500;
  const center = range.left - shell.left + range.width / 2;
  const above = range.top - shell.top - height - 10;
  const below = range.bottom - shell.top + 10;
  const top = above >= 0 || below + height > shell.height ? above : below;
  const left = shell.width > width + 24
    ? Math.max(width / 2 + 12, Math.min(center, shell.width - width / 2 - 12))
    : shell.width / 2;
  return { top: Math.max(0, Math.min(top, Math.max(shell.height - height, 0))), left };
}

function ToolbarButton({ active = false, icon, label, onClick, text }: {
  active?: boolean; icon?: ReactNode; label: string; onClick: () => void; text?: string;
}) {
  return (
    <button type="button" className={cn('article-editor-floating-toolbar-button',
      active && 'article-editor-floating-toolbar-button-active')}
      title={label} aria-label={label} aria-pressed={active} onClick={onClick}
      onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}>
      {icon ?? <span>{text}</span>}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="article-editor-floating-toolbar-divider" aria-hidden="true" />;
}
