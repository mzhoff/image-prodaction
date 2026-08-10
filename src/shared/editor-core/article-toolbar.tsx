'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { TOGGLE_LINK_COMMAND } from '@lexical/link';
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND } from '@lexical/list';
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text';
import type { HeadingTagType } from '@lexical/rich-text';
import { INSERT_TABLE_COMMAND } from '@lexical/table';
import { $setBlocksType } from '@lexical/selection';
import { $createParagraphNode, $getSelection, $insertNodes, $isRangeSelection,
  FORMAT_TEXT_COMMAND } from 'lexical';
import type { ReactNode } from 'react';
import { Bold, Heading2, Heading3, Heading4, ImagePlus, Italic, Link2, List,
  ListOrdered, Quote, RemoveFormatting, Strikethrough, Table2, Underline } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { $createArticleImageNode } from './article-image-node';
import { normalizeEditorUrl } from './article-rich-text-state';

export function ArticleToolbar({ fullscreen }: { fullscreen: boolean }) {
  const [editor] = useLexicalComposerContext();
  const setHeading = (tag: HeadingTagType) => editor.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createHeadingNode(tag));
  });
  const setParagraph = () => editor.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createParagraphNode());
  });
  const setQuote = () => editor.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createQuoteNode());
  });
  const applyLink = () => {
    const url = normalizeEditorUrl(window.prompt('Link URL'));
    if (url) editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
  };
  const insertImage = () => {
    const src = normalizeEditorUrl(window.prompt('Image URL'));
    if (!src) return;
    const alt = window.prompt('Image caption or alt text')?.trim() ?? '';
    editor.update(() => $insertNodes([$createArticleImageNode(src, alt)]));
  };
  const insertTable = () => editor.dispatchCommand(INSERT_TABLE_COMMAND, {
    columns: '3', includeHeaders: true, rows: '3',
  });
  return (
    <div className={cn('article-editor-toolbar',
      fullscreen && 'article-editor-toolbar-fullscreen')} data-node-interactive>
      <ToolbarButton label="Paragraph" text="P" onClick={setParagraph} />
      <ToolbarButton label="Heading 2" icon={<Heading2 size={14} />} onClick={() => setHeading('h2')} />
      <ToolbarButton label="Heading 3" icon={<Heading3 size={14} />} onClick={() => setHeading('h3')} />
      <ToolbarButton label="Heading 4" icon={<Heading4 size={14} />} onClick={() => setHeading('h4')} />
      <ToolbarDivider />
      <ToolbarButton label="Bold" icon={<Bold size={14} />}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')} />
      <ToolbarButton label="Italic" icon={<Italic size={14} />}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')} />
      <ToolbarButton label="Underline" icon={<Underline size={14} />}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')} />
      <ToolbarButton label="Strikethrough" icon={<Strikethrough size={14} />}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')} />
      <ToolbarDivider />
      <ToolbarButton label="Link" icon={<Link2 size={14} />} onClick={applyLink} />
      <ToolbarButton label="Bullet list" icon={<List size={14} />}
        onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)} />
      <ToolbarButton label="Numbered list" icon={<ListOrdered size={14} />}
        onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)} />
      <ToolbarButton label="Remove list" icon={<RemoveFormatting size={14} />}
        onClick={() => editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)} />
      <ToolbarButton label="Quote" icon={<Quote size={14} />} onClick={setQuote} />
      <ToolbarButton label="Image" icon={<ImagePlus size={14} />} onClick={insertImage} />
      <ToolbarButton label="Table" icon={<Table2 size={14} />} onClick={insertTable} />
    </div>
  );
}

function ToolbarButton({ icon, label, onClick, text }: {
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  text?: string;
}) {
  return (
    <button type="button" className="article-editor-toolbar-button" title={label}
      aria-label={label} onClick={onClick} onPointerDown={(event) => {
        event.preventDefault(); event.stopPropagation();
      }}>
      {icon ?? <span>{text}</span>}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="article-editor-toolbar-divider" />;
}
