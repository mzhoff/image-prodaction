export interface ArticleRichTextEditorValue {
  plainText: string;
  richText: string;
}

export interface ArticleRichTextEditorProps {
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
