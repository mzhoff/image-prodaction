'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { $getRoot } from 'lexical';
import { useEffect } from 'react';
import type { ArticleRichTextEditorProps,
  ArticleRichTextEditorValue } from './article-rich-text-contracts';
import { normalizeArticleRichText, parseRichEditorState,
  rebuildEditorState } from './article-rich-text-state';

export function ArticleEditorSyncPlugin({ parseMarkdown, richText, value }:
  Pick<ArticleRichTextEditorProps, 'parseMarkdown' | 'richText' | 'value'>) {
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
    editor.update(() => rebuildEditorState(value, Boolean(parseMarkdown)), {
      tag: 'external-sync',
    });
  }, [editor, parseMarkdown, richText, value]);
  return null;
}

export function ArticleEditorChangePlugin({ onChange }: {
  onChange?: (value: ArticleRichTextEditorValue) => void;
}) {
  return (
    <OnChangePlugin ignoreHistoryMergeTagChange ignoreSelectionChange
      onChange={(editorState, _editor, tags) => {
        if (tags.has('external-sync')) return;
        const richText = JSON.stringify(editorState.toJSON());
        editorState.read(() => onChange?.({
          plainText: $getRoot().getTextContent().trim(), richText,
        }));
      }}
    />
  );
}
