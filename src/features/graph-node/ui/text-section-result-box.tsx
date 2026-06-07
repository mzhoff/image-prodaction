'use client';

import { useEffect, useMemo, useRef, type WheelEvent as ReactWheelEvent } from 'react';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  ParagraphNode,
  type EditorConfig,
  type LexicalEditor,
  type LexicalUpdateJSON,
  type NodeKey,
  type SerializedParagraphNode,
} from 'lexical';
import {
  parseTextSectionSegments,
  textSectionSegmentToText,
  type ParseTextSectionOptions,
} from '@/entities/production-graph/model/text-section-filters';
import { cn } from '@/shared/lib/cn';

interface TextSectionResultBoxProps {
  ariaLabel?: string;
  className?: string;
  disabledFilterIds?: string[];
  onChange?: (value: string) => void;
  parseOptions?: ParseTextSectionOptions;
  scrollToStart?: number | null;
  value?: string;
}

type SerializedTextSectionParagraphNode = SerializedParagraphNode & {
  muted?: boolean;
  sectionId?: string | null;
  sectionStart?: number | null;
};

class TextSectionParagraphNode extends ParagraphNode {
  __muted: boolean;
  __sectionId: string | null;
  __sectionStart: number | null;

  static getType() {
    return 'text-section-paragraph';
  }

  static clone(node: TextSectionParagraphNode) {
    return new TextSectionParagraphNode(node.__sectionId, node.__muted, node.__sectionStart, node.__key);
  }

  static importJSON(serializedNode: SerializedTextSectionParagraphNode) {
    return $createTextSectionParagraphNode(
      serializedNode.sectionId ?? null,
      Boolean(serializedNode.muted),
      serializedNode.sectionStart ?? null,
    ).updateFromJSON(serializedNode as LexicalUpdateJSON<SerializedParagraphNode>);
  }

  constructor(sectionId: string | null = null, muted = false, sectionStart: number | null = null, key?: NodeKey) {
    super(key);
    this.__muted = muted;
    this.__sectionId = sectionId;
    this.__sectionStart = sectionStart;
  }

  createDOM(config: EditorConfig) {
    const dom = super.createDOM(config);
    syncSectionClasses(dom, this.__muted, this.__sectionStart);
    return dom;
  }

  updateDOM(prevNode: TextSectionParagraphNode, dom: HTMLElement, config: EditorConfig) {
    const shouldReplace = super.updateDOM(prevNode, dom, config);
    const sectionChanged = prevNode.__muted !== this.__muted || prevNode.__sectionStart !== this.__sectionStart;
    if (!shouldReplace && sectionChanged) {
      syncSectionClasses(dom, this.__muted, this.__sectionStart);
    }
    return shouldReplace;
  }

  exportJSON(): SerializedTextSectionParagraphNode {
    return {
      ...super.exportJSON(),
      muted: this.__muted,
      sectionId: this.__sectionId,
      sectionStart: this.__sectionStart,
      type: 'text-section-paragraph',
      version: 1,
    };
  }
}

export function TextSectionResultBox({
  ariaLabel = 'Text section result',
  className,
  disabledFilterIds = [],
  onChange,
  parseOptions,
  scrollToStart,
  value,
}: TextSectionResultBoxProps) {
  const initialValueRef = useRef(value);
  const initialDisabledFilterIdsRef = useRef(disabledFilterIds);
  const parseOptionsRef = useRef(parseOptions);
  parseOptionsRef.current = parseOptions;

  const editorConfig = useMemo(() => ({
    editorState: () => rebuildEditorState(initialValueRef.current, initialDisabledFilterIdsRef.current, parseOptionsRef.current),
    namespace: 'TextSectionResultBox',
    nodes: [TextSectionParagraphNode],
    onError: (error: Error, editor: LexicalEditor) => {
      console.error('Text section result editor failed', { editor, error });
    },
    theme: {
      paragraph: 'text-section-result-paragraph',
    },
  }), []);

  return (
    <div
      className={cn('prompt-box text-section-result-box', className)}
      data-canvas-wheel-scroll="true"
      data-node-interactive
      onWheelCapture={handleResultWheel}
    >
      <LexicalComposer initialConfig={editorConfig}>
        <RichTextPlugin
          contentEditable={(
            <ContentEditable
              aria-label={ariaLabel}
              className="text-section-result-editor"
              data-node-interactive
              spellCheck={false}
            />
          )}
          placeholder={null}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <TextSectionSyncPlugin
          disabledFilterIds={disabledFilterIds}
          parseOptions={parseOptions}
          value={value}
        />
        <TextSectionScrollPlugin scrollToStart={scrollToStart} />
        <TextSectionChangePlugin onChange={onChange} />
      </LexicalComposer>
    </div>
  );
}

function TextSectionChangePlugin({ onChange }: { onChange?: (value: string) => void }) {
  return (
    <OnChangePlugin
      ignoreHistoryMergeTagChange
      ignoreSelectionChange
      onChange={(editorState, _editor, tags) => {
        if (tags.has('external-sync')) return;
        editorState.read(() => {
          onChange?.(normalizeEditorText($getRoot().getTextContent()));
        });
      }}
    />
  );
}

function TextSectionScrollPlugin({ scrollToStart }: { scrollToStart?: number | null }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (scrollToStart === null || scrollToStart === undefined) return;
    const rootElement = editor.getRootElement();
    const target = rootElement?.querySelector<HTMLElement>(`[data-text-section-start="${scrollToStart}"]`);
    target?.scrollIntoView({ block: 'center' });
    editor.focus();
  }, [editor, scrollToStart]);

  return null;
}

function TextSectionSyncPlugin({
  disabledFilterIds,
  parseOptions,
  value,
}: Pick<TextSectionResultBoxProps, 'disabledFilterIds' | 'parseOptions' | 'value'>) {
  const [editor] = useLexicalComposerContext();
  const disabledKey = getDisabledKey(disabledFilterIds);
  const lastDisabledKeyRef = useRef<string | null>(null);
  const lastParseOptionsRef = useRef(parseOptions);

  useEffect(() => {
    let currentText = '';
    editor.getEditorState().read(() => {
      currentText = normalizeEditorText($getRoot().getTextContent());
    });

    const nextText = normalizeEditorText(value);
    const disabledChanged = lastDisabledKeyRef.current !== disabledKey;
    const parseOptionsChanged = lastParseOptionsRef.current !== parseOptions;
    if (!disabledChanged && !parseOptionsChanged && currentText === nextText) return;

    editor.update(() => {
      rebuildEditorState(value, disabledFilterIds, parseOptions);
    }, { tag: 'external-sync' });
    lastDisabledKeyRef.current = disabledKey;
    lastParseOptionsRef.current = parseOptions;
  }, [disabledFilterIds, disabledKey, editor, parseOptions, value]);

  return null;
}

function rebuildEditorState(
  value: string | undefined,
  disabledFilterIds: string[] | undefined,
  parseOptions: ParseTextSectionOptions | undefined,
) {
  const root = $getRoot();
  const disabled = new Set(disabledFilterIds ?? []);
  root.clear();

  const segments = parseTextSectionSegments(value, parseOptions);
  if (segments.length === 0) {
    root.append($createParagraphNode());
    return;
  }

  for (const segment of segments) {
    const muted = Boolean(segment.type === 'section' && !segment.duplicate && segment.id && disabled.has(segment.id));
    const node = segment.type === 'section'
      ? $createTextSectionParagraphNode(segment.id ?? null, muted, segment.start)
      : $createParagraphNode();
    node.append($createTextNode(textSectionSegmentToText(segment)));
    root.append(node);
  }
}

function $createTextSectionParagraphNode(sectionId: string | null, muted = false, sectionStart: number | null = null) {
  return new TextSectionParagraphNode(sectionId, muted, sectionStart);
}

function syncSectionClasses(dom: HTMLElement, muted: boolean, sectionStart: number | null) {
  dom.className = cn(
    'text-section-result-paragraph',
    'text-section-result-section-paragraph',
    muted && 'text-section-result-section-paragraph-muted',
  );

  if (sectionStart === null) {
    delete dom.dataset.textSectionStart;
  } else {
    dom.dataset.textSectionStart = String(sectionStart);
  }
}

function normalizeEditorText(value: string | undefined) {
  return (value ?? '').replace(/\u00a0/g, ' ').trim();
}

function getDisabledKey(disabledFilterIds: string[] | undefined) {
  return [...(disabledFilterIds ?? [])].sort().join('|');
}

function handleResultWheel(event: ReactWheelEvent<HTMLDivElement>) {
  const box = event.currentTarget;
  const canScrollY = box.scrollHeight > box.clientHeight;
  const canScrollX = box.scrollWidth > box.clientWidth;
  if (!canScrollY && !canScrollX) return;

  event.preventDefault();
  event.stopPropagation();

  const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? 16
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? box.clientHeight
      : 1;
  const deltaY = event.deltaY * scale;
  const deltaX = event.deltaX * scale;

  if (canScrollX && (event.shiftKey || Math.abs(deltaX) > Math.abs(deltaY))) {
    box.scrollLeft += deltaX || deltaY;
    return;
  }

  if (canScrollY) box.scrollTop += deltaY;
}
