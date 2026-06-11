'use client';

import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { $convertFromMarkdownString, BOLD_ITALIC_STAR, BOLD_ITALIC_UNDERSCORE, BOLD_STAR, BOLD_UNDERSCORE, HEADING, INLINE_CODE, ITALIC_STAR, ITALIC_UNDERSCORE, LINK, ORDERED_LIST, QUOTE, STRIKETHROUGH, UNORDERED_LIST, type Transformer } from '@lexical/markdown';
import { $isLinkNode, LinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import { $isListNode, INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND, ListItemNode, ListNode, REMOVE_LIST_COMMAND } from '@lexical/list';
import { $createHeadingNode, $createQuoteNode, $isHeadingNode, $isQuoteNode, HeadingNode, QuoteNode, type HeadingTagType } from '@lexical/rich-text';
import { TablePlugin } from '@lexical/react/LexicalTablePlugin';
import { INSERT_TABLE_COMMAND, TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import { $setBlocksType } from '@lexical/selection';
import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bold, Heading2, Heading3, Heading4, ImagePlus, Italic, Link2, List, ListOrdered, Quote, RemoveFormatting, Strikethrough, Table2, Underline } from 'lucide-react';
import { $createParagraphNode, $createTextNode, $findMatchingParent, $getRoot, $getSelection, $insertNodes, $isRangeSelection, COMMAND_PRIORITY_LOW, FORMAT_TEXT_COMMAND, SELECTION_CHANGE_COMMAND, type LexicalEditor, type TextFormatType } from 'lexical';
import { cn } from '@/shared/lib/cn';
import { useScrollableWheel } from '@/shared/ui/use-scrollable-wheel';
import { ArticleImageNode, $createArticleImageNode } from './article-image-node';

export interface ArticleRichTextEditorValue {
  plainText: string;
  richText: string;
}

interface ArticleRichTextEditorProps {
  className?: string;
  editorClassName?: string;
  fullscreen?: boolean;
  minHeight?: number;
  namespace?: string;
  onChange?: (value: ArticleRichTextEditorValue) => void;
  parseMarkdown?: boolean;
  placeholder?: string;
  richText?: string;
  value?: string;
}

const ARTICLE_MARKDOWN_TRANSFORMERS: Transformer[] = [
  HEADING,
  QUOTE,
  UNORDERED_LIST,
  ORDERED_LIST,
  LINK,
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  STRIKETHROUGH,
  INLINE_CODE,
];

const editorTheme = {
  heading: {
    h1: 'article-editor-h1',
    h2: 'article-editor-h2',
    h3: 'article-editor-h3',
    h4: 'article-editor-h4',
  },
  link: 'article-editor-link',
  list: {
    listitem: 'article-editor-list-item',
    nested: {
      listitem: 'article-editor-nested-list-item',
    },
    ol: 'article-editor-ol',
    ul: 'article-editor-ul',
  },
  paragraph: 'article-editor-paragraph',
  quote: 'article-editor-quote',
  text: {
    bold: 'article-editor-bold',
    code: 'article-editor-code',
    italic: 'article-editor-italic',
    strikethrough: 'article-editor-strikethrough',
    underline: 'article-editor-underline',
  },
};

const floatingToolbarItems = [
  { format: 'bold', label: 'Bold', icon: Bold },
  { format: 'italic', label: 'Italic', icon: Italic },
  { format: 'underline', label: 'Underline', icon: Underline },
  { format: 'strikethrough', label: 'Strikethrough', icon: Strikethrough },
] as const satisfies ReadonlyArray<{
  format: TextFormatType;
  label: string;
  icon: typeof Bold;
}>;

type FloatingToolbarFormat = (typeof floatingToolbarItems)[number]['format'];
type FloatingToolbarListType = 'bullet' | 'number';

export function ArticleRichTextEditor({
  className,
  editorClassName,
  fullscreen = false,
  minHeight,
  namespace = 'ArticleRichTextEditor',
  onChange,
  parseMarkdown = false,
  placeholder = 'Format article...',
  richText,
  value,
}: ArticleRichTextEditorProps) {
  const initialValueRef = useRef(value);
  const initialRichTextRef = useRef(richText);
  const parseMarkdownRef = useRef(parseMarkdown);
  const handleWheel = useScrollableWheel<HTMLDivElement>();
  const editorStyle = minHeight ? { '--article-editor-min-height': `${minHeight}px` } as CSSProperties : undefined;
  const editorConfig = useMemo(() => ({
    editorState: getInitialEditorState(initialRichTextRef.current, initialValueRef.current, parseMarkdownRef.current),
    namespace,
    nodes: [ArticleImageNode, HeadingNode, LinkNode, ListItemNode, ListNode, QuoteNode, TableCellNode, TableNode, TableRowNode],
    onError: (error: Error, editor: LexicalEditor) => {
      console.error('Article rich text editor failed', { editor, error });
    },
    theme: editorTheme,
  }), [namespace]);

  return (
    <div
      className={cn('article-editor-shell', fullscreen && 'article-editor-shell-fullscreen', className)}
      data-editor-shell
      data-node-interactive
      style={editorStyle}
    >
      <LexicalComposer initialConfig={editorConfig}>
        <ArticleToolbar fullscreen={fullscreen} />
        <RichTextPlugin
          contentEditable={(
            <ContentEditable
              aria-label="Article editor"
              className={cn('article-editor-content', editorClassName)}
              data-canvas-wheel-scroll="true"
              data-node-interactive
              onWheelCapture={handleWheel}
              spellCheck
            />
          )}
          placeholder={<div className="article-editor-placeholder">{placeholder}</div>}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <FloatingSelectionToolbar fullscreen={fullscreen} />
        <HistoryPlugin />
        <LinkPlugin />
        <ListPlugin />
        <TablePlugin hasCellMerge hasHorizontalScroll />
        <ArticleEditorSyncPlugin parseMarkdown={parseMarkdown} richText={richText} value={value} />
        <ArticleEditorChangePlugin onChange={onChange} />
      </LexicalComposer>
    </div>
  );
}

function FloatingSelectionToolbar({ fullscreen }: { fullscreen: boolean }) {
  const [editor] = useLexicalComposerContext();
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [activeFormats, setActiveFormats] = useState<Partial<Record<FloatingToolbarFormat, boolean>>>({});
  const [activeHeading, setActiveHeading] = useState<HeadingTagType | null>(null);
  const [activeListType, setActiveListType] = useState<FloatingToolbarListType | null>(null);
  const [isQuoteActive, setIsQuoteActive] = useState(false);
  const [isLinkActive, setIsLinkActive] = useState(false);

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    const nativeSelection = window.getSelection();
    const rootElement = editor.getRootElement();

    if (
      !$isRangeSelection(selection) ||
      selection.isCollapsed() ||
      !nativeSelection ||
      nativeSelection.isCollapsed ||
      nativeSelection.rangeCount === 0 ||
      !rootElement ||
      !nativeSelection.anchorNode ||
      !rootElement.contains(nativeSelection.anchorNode)
    ) {
      setPosition(null);
      setActiveFormats({});
      setActiveHeading(null);
      setActiveListType(null);
      setIsQuoteActive(false);
      setIsLinkActive(false);
      return;
    }

    const range = nativeSelection.getRangeAt(0);
    const rangeRect = range.getBoundingClientRect();
    const shellElement = rootElement.closest<HTMLElement>('[data-editor-shell]');
    const shellRect = shellElement?.getBoundingClientRect();

    if (!shellRect || (rangeRect.width === 0 && rangeRect.height === 0)) {
      setPosition(null);
      setActiveFormats({});
      setActiveHeading(null);
      setActiveListType(null);
      setIsQuoteActive(false);
      setIsLinkActive(false);
      return;
    }

    const toolbarHeight = fullscreen ? 44 : 40;
    const toolbarGap = 10;
    const estimatedToolbarWidth = fullscreen ? 560 : 500;
    const shellHeight = shellRect.height;
    const shellWidth = shellRect.width;
    const selectionCenterX = rangeRect.left - shellRect.left + rangeRect.width / 2;
    const topAbove = rangeRect.top - shellRect.top - toolbarHeight - toolbarGap;
    const topBelow = rangeRect.bottom - shellRect.top + toolbarGap;
    const hasRoomAbove = topAbove >= 0;
    const hasRoomBelow = topBelow + toolbarHeight <= shellHeight;
    const shouldPlaceAbove = hasRoomAbove || !hasRoomBelow;
    const clampedTop = Math.max(
      0,
      Math.min(
        shouldPlaceAbove ? topAbove : topBelow,
        Math.max(shellHeight - toolbarHeight, 0),
      ),
    );
    const halfEstimatedWidth = estimatedToolbarWidth / 2;
    const clampedLeft = shellWidth > estimatedToolbarWidth + 24
      ? Math.max(
        halfEstimatedWidth + 12,
        Math.min(selectionCenterX, shellWidth - halfEstimatedWidth - 12),
      )
      : shellWidth / 2;

    setPosition({
      top: clampedTop,
      left: clampedLeft,
    });
    setActiveFormats({
      bold: selection.hasFormat('bold'),
      italic: selection.hasFormat('italic'),
      underline: selection.hasFormat('underline'),
      strikethrough: selection.hasFormat('strikethrough'),
    });

    const anchorNode = selection.anchor.getNode();
    const linkNode = $findMatchingParent(anchorNode, $isLinkNode);
    const blockNode = anchorNode.getKey() === 'root' ? anchorNode : anchorNode.getTopLevelElementOrThrow();
    const parentNode = blockNode.getParent();
    const listNode = $isListNode(blockNode) ? blockNode : $isListNode(parentNode) ? parentNode : null;
    const listType = listNode?.getListType();

    setActiveHeading($isHeadingNode(blockNode) ? (blockNode.getTag() as HeadingTagType) : null);
    setActiveListType(listType === 'bullet' || listType === 'number' ? listType : null);
    setIsQuoteActive($isQuoteNode(blockNode));
    setIsLinkActive(Boolean(linkNode) || $isLinkNode(anchorNode));
  }, [editor, fullscreen]);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(updateToolbar);
    });
  }, [editor, updateToolbar]);

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateToolbar();
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, updateToolbar]);

  useEffect(() => {
    function handleViewportChange() {
      editor.getEditorState().read(updateToolbar);
    }

    window.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);

    return () => {
      window.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [editor, updateToolbar]);

  const applyHeading = (tag: HeadingTagType) => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      for (const item of floatingToolbarItems) {
        if (selection.hasFormat(item.format)) {
          selection.formatText(item.format);
        }
      }
      $setBlocksType(selection, () => $createHeadingNode(tag));
    });
  };

  const setParagraph = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => $createParagraphNode());
      }
    });
  };

  const toggleQuote = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => (isQuoteActive ? $createParagraphNode() : $createQuoteNode()));
      }
    });
  };

  const toggleLink = () => {
    const rawUrl = window.prompt(isLinkActive ? 'Введите новую ссылку или оставьте пустой, чтобы снять ссылку.' : 'Введите ссылку.');
    if (rawUrl === null) return;
    const url = normalizeEditorUrl(rawUrl);
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, url || null);
  };

  const toggleList = (type: FloatingToolbarListType) => {
    if (activeListType === type) {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
      return;
    }

    editor.dispatchCommand(type === 'bullet' ? INSERT_UNORDERED_LIST_COMMAND : INSERT_ORDERED_LIST_COMMAND, undefined);
  };

  if (!position) return null;

  return (
    <div
      className={cn('article-editor-floating-toolbar', fullscreen && 'article-editor-floating-toolbar-fullscreen')}
      data-node-interactive
      style={{ top: position.top, left: position.left, transform: 'translateX(-50%)' }}
    >
      <FloatingToolbarButton label="Paragraph" text="P" onClick={setParagraph} />
      <FloatingToolbarButton label="Heading 2" icon={<Heading2 size={14} />} active={activeHeading === 'h2'} onClick={() => applyHeading('h2')} />
      <FloatingToolbarButton label="Heading 3" icon={<Heading3 size={14} />} active={activeHeading === 'h3'} onClick={() => applyHeading('h3')} />
      <FloatingToolbarButton label="Heading 4" icon={<Heading4 size={14} />} active={activeHeading === 'h4'} onClick={() => applyHeading('h4')} />
      <FloatingToolbarDivider />
      {floatingToolbarItems.map((item) => {
        const Icon = item.icon;
        return (
          <FloatingToolbarButton
            key={item.format}
            label={item.label}
            icon={<Icon size={14} />}
            active={activeFormats[item.format] ?? false}
            onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, item.format)}
          />
        );
      })}
      <FloatingToolbarDivider />
      <FloatingToolbarButton label="Link" icon={<Link2 size={14} />} active={isLinkActive} onClick={toggleLink} />
      <FloatingToolbarButton label="Bullet list" icon={<List size={14} />} active={activeListType === 'bullet'} onClick={() => toggleList('bullet')} />
      <FloatingToolbarButton label="Numbered list" icon={<ListOrdered size={14} />} active={activeListType === 'number'} onClick={() => toggleList('number')} />
      <FloatingToolbarButton label="Quote" icon={<Quote size={14} />} active={isQuoteActive} onClick={toggleQuote} />
    </div>
  );
}

function FloatingToolbarButton({
  active = false,
  icon,
  label,
  onClick,
  text,
}: {
  active?: boolean;
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  text?: string;
}) {
  return (
    <button
      type="button"
      className={cn('article-editor-floating-toolbar-button', active && 'article-editor-floating-toolbar-button-active')}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {icon ?? <span>{text}</span>}
    </button>
  );
}

function FloatingToolbarDivider() {
  return <span className="article-editor-floating-toolbar-divider" aria-hidden="true" />;
}

function ArticleToolbar({ fullscreen }: { fullscreen: boolean }) {
  const [editor] = useLexicalComposerContext();

  const setHeading = (tag: HeadingTagType) => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createHeadingNode(tag));
    });
  };

  const setParagraph = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createParagraphNode());
    });
  };

  const setQuote = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createQuoteNode());
    });
  };

  const applyLink = () => {
    const url = window.prompt('Link URL');
    const normalizedUrl = normalizeEditorUrl(url);
    if (!normalizedUrl) return;
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, normalizedUrl);
  };

  const insertImage = () => {
    const src = normalizeEditorUrl(window.prompt('Image URL'));
    if (!src) return;
    const alt = window.prompt('Image caption or alt text')?.trim() ?? '';
    editor.update(() => {
      $insertNodes([$createArticleImageNode(src, alt)]);
    });
  };

  const insertTable = () => {
    editor.dispatchCommand(INSERT_TABLE_COMMAND, {
      columns: '3',
      includeHeaders: true,
      rows: '3',
    });
  };

  return (
    <div className={cn('article-editor-toolbar', fullscreen && 'article-editor-toolbar-fullscreen')} data-node-interactive>
      <ToolbarButton label="Paragraph" text="P" onClick={setParagraph} />
      <ToolbarButton label="Heading 2" icon={<Heading2 size={14} />} onClick={() => setHeading('h2')} />
      <ToolbarButton label="Heading 3" icon={<Heading3 size={14} />} onClick={() => setHeading('h3')} />
      <ToolbarButton label="Heading 4" icon={<Heading4 size={14} />} onClick={() => setHeading('h4')} />
      <ToolbarDivider />
      <ToolbarButton label="Bold" icon={<Bold size={14} />} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')} />
      <ToolbarButton label="Italic" icon={<Italic size={14} />} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')} />
      <ToolbarButton label="Underline" icon={<Underline size={14} />} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')} />
      <ToolbarButton label="Strikethrough" icon={<Strikethrough size={14} />} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')} />
      <ToolbarDivider />
      <ToolbarButton label="Link" icon={<Link2 size={14} />} onClick={applyLink} />
      <ToolbarButton label="Bullet list" icon={<List size={14} />} onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)} />
      <ToolbarButton label="Numbered list" icon={<ListOrdered size={14} />} onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)} />
      <ToolbarButton label="Remove list" icon={<RemoveFormatting size={14} />} onClick={() => editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)} />
      <ToolbarButton label="Quote" icon={<Quote size={14} />} onClick={setQuote} />
      <ToolbarButton label="Image" icon={<ImagePlus size={14} />} onClick={insertImage} />
      <ToolbarButton label="Table" icon={<Table2 size={14} />} onClick={insertTable} />
    </div>
  );
}

function ToolbarButton({
  icon,
  label,
  onClick,
  text,
}: {
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  text?: string;
}) {
  return (
    <button
      type="button"
      className="article-editor-toolbar-button"
      title={label}
      aria-label={label}
      onClick={onClick}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {icon ?? <span>{text}</span>}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="article-editor-toolbar-divider" />;
}

function ArticleEditorSyncPlugin({
  parseMarkdown,
  richText,
  value,
}: Pick<ArticleRichTextEditorProps, 'parseMarkdown' | 'richText' | 'value'>) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const nextRichText = normalizeArticleRichText(richText);
    if (nextRichText) {
      const currentRichText = JSON.stringify(editor.getEditorState().toJSON());
      if (currentRichText === nextRichText) return;
      const parsedState = parseRichEditorState(editor, nextRichText);
      if (parsedState) {
        editor.setEditorState(parsedState, { tag: 'external-sync' });
        return;
      }
    }

    editor.update(() => {
      rebuildEditorState(value, Boolean(parseMarkdown));
    }, { tag: 'external-sync' });
  }, [editor, parseMarkdown, richText, value]);

  return null;
}

function ArticleEditorChangePlugin({ onChange }: { onChange?: (value: ArticleRichTextEditorValue) => void }) {
  return (
    <OnChangePlugin
      ignoreHistoryMergeTagChange
      ignoreSelectionChange
      onChange={(editorState, _editor, tags) => {
        if (tags.has('external-sync')) return;
        const richText = JSON.stringify(editorState.toJSON());
        editorState.read(() => {
          onChange?.({
            plainText: $getRoot().getTextContent().trim(),
            richText,
          });
        });
      }}
    />
  );
}

function getInitialEditorState(richText: string | undefined, value: string | undefined, parseMarkdown: boolean) {
  const normalizedRichText = normalizeArticleRichText(richText);
  if (normalizedRichText) return normalizedRichText;
  return () => rebuildEditorState(value, parseMarkdown);
}

function rebuildEditorState(value: string | undefined, parseMarkdown: boolean) {
  const text = value?.trim() ?? '';
  const root = $getRoot();
  root.clear();

  if (!text) {
    root.append($createParagraphNode());
    return;
  }

  if (parseMarkdown) {
    $convertFromMarkdownString(text, ARTICLE_MARKDOWN_TRANSFORMERS);
    return;
  }

  for (const block of text.split(/\n{2,}/)) {
    const paragraph = $createParagraphNode();
    paragraph.append($createTextNode(block.trim()));
    root.append(paragraph);
  }
}

function parseRichEditorState(editor: LexicalEditor, richText: string) {
  try {
    return editor.parseEditorState(richText);
  } catch {
    return null;
  }
}

export function normalizeArticleRichText(value: string | undefined) {
  if (!value?.trim()) return '';
  try {
    const parsed = JSON.parse(value) as { root?: { children?: unknown[] } };
    return Array.isArray(parsed.root?.children) ? value : '';
  } catch {
    return '';
  }
}

function normalizeEditorUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  if (/^(https?:|data:image\/|blob:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function getPlainTextFromArticleRichText(richText: string | undefined) {
  const normalizedRichText = normalizeArticleRichText(richText);
  if (!normalizedRichText) return '';
  try {
    const parsed = JSON.parse(normalizedRichText) as { root?: { children?: SerializedArticleNode[] } };
    return collectBlockTexts(parsed.root?.children ?? []).join('\n\n').trim();
  } catch {
    return '';
  }
}

interface SerializedArticleNode {
  children?: SerializedArticleNode[];
  text?: string;
  type?: string;
}

function collectBlockTexts(nodes: SerializedArticleNode[]) {
  return nodes.flatMap((node) => {
    if (node.type === 'list') return collectListItemTexts(node.children ?? []);
    const text = collectInlineText(node).trim();
    return text ? [text] : [];
  });
}

function collectListItemTexts(nodes: SerializedArticleNode[]) {
  return nodes.flatMap((node) => {
    const text = collectInlineText(node).trim();
    return text ? [text] : [];
  });
}

function collectInlineText(node: SerializedArticleNode): string {
  if (typeof node.text === 'string') return node.text;
  if (node.type === 'article-image') return '[Image]';
  return (node.children ?? []).map(collectInlineText).join('');
}
