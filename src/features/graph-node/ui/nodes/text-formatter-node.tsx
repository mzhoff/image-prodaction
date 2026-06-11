'use client';

import { createPortal } from 'react-dom';
import { FileText, Maximize2, Minimize2, Scan, X } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useState } from 'react';
import type { FormattedTextFeature } from '@/entities/production-graph/model/formatted-text';
import type { ProductionNode, TextFormatterNodeData } from '@/entities/production-graph/model/types';
import { ArticleRichTextEditor } from '@/shared/editor-core';
import { DarkSelect } from '@/shared/ui/dark-select';
import { useNodeDisplayState } from '../../model/use-node-display-state';
import { clampTextFormatterEditorHeight, clampTextFormatterNodeWidth, useTextFormatterNodeModel } from '../../model/use-text-workflow-node-models';
import { NodeTitle, NodeTitleActions, NodeTitleOptionsButton } from '../node-title';
import { PortButton } from '../port-button';
import { TelegramMessageEditor } from '../telegram-message-editor';
import type { TelegramTextContextMenuFeature } from '../telegram-message-editor-context-menu';

interface TextFormatterNodeProps {
  node: ProductionNode;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
}

export function TextFormatterNode({ node, onStartConnection }: TextFormatterNodeProps) {
  const data = node.data as TextFormatterNodeData;
  const model = useTextFormatterNodeModel(node);
  const { isCollapsed: collapsed, setCollapsed } = useNodeDisplayState(node.id);
  const [draftEditorHeight, setDraftEditorHeight] = useState(model.editorHeight);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    setDraftEditorHeight(model.editorHeight);
  }, [model.editorHeight]);

  useEffect(() => {
    if (!previewOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewOpen]);

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startHeight = draftEditorHeight;
    let nextHeight = startHeight;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      nextHeight = clampTextFormatterEditorHeight(startHeight + moveEvent.clientY - startY);
      setDraftEditorHeight(nextHeight);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (nextHeight !== model.editorHeight) model.handleEditorHeightChange(nextHeight);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  };

  const handleWidthResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const card = event.currentTarget.closest<HTMLElement>('[data-node-id]');
    const startX = event.clientX;
    const startWidth = node.size.width;
    let nextWidth = startWidth;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      nextWidth = clampTextFormatterNodeWidth(startWidth + moveEvent.clientX - startX);
      if (card) card.style.width = `${nextWidth}px`;
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (nextWidth !== node.size.width) model.handleNodeWidthChange(nextWidth);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  };

  return (
    <>
      <NodeTitle
        title={data.title}
        nodeType={node.type}
        muted
        action={(
          <NodeTitleActions>
            <button
                type="button"
                className="node-title-action"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  setCollapsed(!collapsed);
                }}
                aria-label={collapsed ? 'Expand node' : 'Collapse node'}
              >
              {collapsed ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
            </button>
            <NodeTitleOptionsButton />
          </NodeTitleActions>
        )}
      />
      <PortButton
        nodeId={node.id}
        portId="text"
        side="input"
        kind="text"
        label="Plain text"
        className="text-node-header-input-port"
        style={{ top: collapsed ? 20 : undefined }}
        onStartConnection={onStartConnection}
      />
      <PortButton
        nodeId={node.id}
        portId="result"
        side="output"
        kind="text"
        label="Formatted text"
        className="text-node-header-output-port"
        style={{ top: collapsed ? 20 : undefined }}
        onStartConnection={onStartConnection}
      />
      {!collapsed ? (
        <div className="text-formatter-body">
          <div className="text-formatter-toolbar" data-node-interactive>
            <label className="text-formatter-preset-control">
              <span>Preset</span>
              <DarkSelect
                value={model.presetId}
                options={model.presetOptions}
                onChange={model.handlePresetChange}
                wide
              />
            </label>
            <div className="text-formatter-preset-meta">
              <FileText size={13} />
              <span>{model.preset.description}</span>
            </div>
            <button
              type="button"
              className="text-formatter-preview-button"
              onClick={(event) => {
                event.stopPropagation();
                setPreviewOpen(true);
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <Scan size={14} />
              <span>Open document</span>
            </button>
          </div>
          {model.usesArticleEditor ? (
            <ArticleRichTextEditor
              className="text-formatter-editor-shell"
              editorClassName="text-formatter-article-editor"
              minHeight={draftEditorHeight}
              namespace={`FormatterArticleEditor-${node.id}`}
              onChange={model.handleEditorChange}
              parseMarkdown={model.shouldParseMarkdown}
              placeholder="Format article..."
              richText={model.richText}
              value={model.plainText}
            />
          ) : (
            <TelegramMessageEditor
              contextMenuFeatures={getContextMenuFeatures(model.preset.features)}
              editorClassName="text-formatter-editor"
              minHeight={draftEditorHeight}
              namespace={`FormatterEditor-${node.id}`}
              onChange={model.handleEditorChange}
              placeholder="Format text..."
              richText={model.richText}
              shellClassName="text-formatter-editor-shell"
              value={model.plainText}
            />
          )}
          <div className="text-formatter-meta-row">
            <span>{model.plainText.length} chars</span>
            <span>{model.sourceCount} input</span>
            <span>{model.preset.features.length} tools</span>
          </div>
          {data.message ? <div className="node-note node-note-compact">{data.message}</div> : null}
          <div
            className="text-formatter-resize-handle"
            data-node-interactive
            onPointerDown={handleResizePointerDown}
            aria-label="Resize formatter editor"
          />
          <div
            className="text-formatter-width-resize-handle"
            data-node-interactive
            onPointerDown={handleWidthResizePointerDown}
            aria-label="Resize formatter node width"
          />
        </div>
      ) : null}
      {previewOpen && typeof document !== 'undefined' ? createPortal(
        <div
          className="text-formatter-document-overlay"
          onClick={() => setPreviewOpen(false)}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="text-formatter-document-sheet" onClick={(event) => event.stopPropagation()} data-node-interactive>
            <div className="text-formatter-document-header">
              <strong>{data.title}</strong>
              <button type="button" aria-label="Close document preview" onClick={() => setPreviewOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <ArticleRichTextEditor
              className="text-formatter-document-editor"
              fullscreen
              minHeight={720}
              namespace={`FormatterArticlePreview-${node.id}`}
              onChange={model.handleEditorChange}
              parseMarkdown={model.shouldParseMarkdown}
              placeholder="Format article..."
              richText={model.richText}
              value={model.plainText}
            />
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

function getContextMenuFeatures(features: FormattedTextFeature[]): TelegramTextContextMenuFeature[] {
  const enabled = new Set(features);
  return [
    enabled.has('bold') ? 'bold' : null,
    enabled.has('italic') ? 'italic' : null,
    enabled.has('underline') ? 'underline' : null,
    enabled.has('strikethrough') ? 'strikethrough' : null,
    enabled.has('code') ? 'code' : null,
    enabled.has('link') ? 'link' : null,
    enabled.has('quote') ? 'quote' : null,
    enabled.has('spoiler') ? 'spoiler' : null,
    'case',
  ].filter((item): item is TelegramTextContextMenuFeature => Boolean(item));
}
