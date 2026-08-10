'use client';

import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { TablePlugin } from '@lexical/react/LexicalTablePlugin';
import { LinkNode } from '@lexical/link';
import { ListItemNode, ListNode } from '@lexical/list';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import type { CSSProperties } from 'react';
import { useMemo, useRef } from 'react';
import type { LexicalEditor } from 'lexical';
import { cn } from '@/shared/lib/cn';
import { useScrollableWheel } from '@/shared/ui/use-scrollable-wheel';
import { ArticleImageNode } from './article-image-node';
import { FloatingSelectionToolbar } from './article-floating-toolbar';
import { ArticleEditorChangePlugin, ArticleEditorSyncPlugin } from './article-rich-text-plugins';
import type { ArticleRichTextEditorProps } from './article-rich-text-contracts';
import { getInitialEditorState } from './article-rich-text-state';
import { ArticleToolbar } from './article-toolbar';

const editorTheme = {
  heading: { h1: 'article-editor-h1', h2: 'article-editor-h2',
    h3: 'article-editor-h3', h4: 'article-editor-h4' },
  link: 'article-editor-link',
  list: {
    listitem: 'article-editor-list-item',
    nested: { listitem: 'article-editor-nested-list-item' },
    ol: 'article-editor-ol', ul: 'article-editor-ul',
  },
  paragraph: 'article-editor-paragraph',
  quote: 'article-editor-quote',
  text: {
    bold: 'article-editor-bold', code: 'article-editor-code',
    italic: 'article-editor-italic', strikethrough: 'article-editor-strikethrough',
    underline: 'article-editor-underline',
  },
};

export function ArticleRichTextEditor({ className, editorClassName, fullscreen = false,
  minHeight, namespace = 'ArticleRichTextEditor', onChange, parseMarkdown = false,
  placeholder = 'Format article...', richText, value }: ArticleRichTextEditorProps) {
  const initialValueRef = useRef(value);
  const initialRichTextRef = useRef(richText);
  const parseMarkdownRef = useRef(parseMarkdown);
  const handleWheel = useScrollableWheel<HTMLDivElement>();
  const editorStyle = minHeight
    ? { '--article-editor-min-height': `${minHeight}px` } as CSSProperties : undefined;
  const editorConfig = useMemo(() => ({
    editorState: getInitialEditorState(initialRichTextRef.current,
      initialValueRef.current, parseMarkdownRef.current),
    namespace,
    nodes: [ArticleImageNode, HeadingNode, LinkNode, ListItemNode, ListNode, QuoteNode,
      TableCellNode, TableNode, TableRowNode],
    onError: (error: Error, editor: LexicalEditor) => {
      console.error('Article rich text editor failed', { editor, error });
    },
    theme: editorTheme,
  }), [namespace]);
  return (
    <div className={cn('article-editor-shell',
      fullscreen && 'article-editor-shell-fullscreen', className)}
      data-editor-shell data-node-interactive style={editorStyle}>
      <LexicalComposer initialConfig={editorConfig}>
        <ArticleToolbar fullscreen={fullscreen} />
        <RichTextPlugin contentEditable={(
          <ContentEditable aria-label="Article editor"
            className={cn('article-editor-content', editorClassName)}
            data-canvas-wheel-scroll="true" data-node-interactive
            onWheelCapture={handleWheel} spellCheck />
        )} placeholder={<div className="article-editor-placeholder">{placeholder}</div>}
        ErrorBoundary={LexicalErrorBoundary} />
        <FloatingSelectionToolbar fullscreen={fullscreen} />
        <HistoryPlugin /><LinkPlugin /><ListPlugin />
        <TablePlugin hasCellMerge hasHorizontalScroll />
        <ArticleEditorSyncPlugin parseMarkdown={parseMarkdown} richText={richText} value={value} />
        <ArticleEditorChangePlugin onChange={onChange} />
      </LexicalComposer>
    </div>
  );
}

export type { ArticleRichTextEditorProps,
  ArticleRichTextEditorValue } from './article-rich-text-contracts';
export { getPlainTextFromArticleRichText,
  normalizeArticleRichText } from './article-rich-text-state';
