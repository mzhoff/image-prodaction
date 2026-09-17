'use client';

import { memo, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Ellipsis, Minimize2, Plus } from '@prodactionpro/ui-core/icons';
import { NodeTitle, NodeTitleActions } from './node-title';
import { TextSectionFilterTags } from './text-section-filter-tags';

export interface TextFragmentPreview {
  text: string; width: number; zoom: number; x: number; y: number;
}

/** Геометрия и UI Prompt без модели ноды, редакторских effects и записей в graph. */
export const TextFragmentDragPreview = memo(function TextFragmentDragPreview({ preview, previewRef, hintRef }: {
  preview: TextFragmentPreview | null;
  previewRef: RefObject<HTMLDivElement | null>;
  hintRef: RefObject<HTMLSpanElement | null>;
}) {
  if (!preview) return null;
  return createPortal(
    <div ref={previewRef} className="text-fragment-drag-preview" aria-hidden="true"
      style={{ transform: `translate3d(${preview.x}px, ${preview.y}px, 0)` }}>
      <article className="production-node production-node-textPrompt production-node-text-workflow"
        style={{ width: preview.width, transform: `scale(${preview.zoom})` }} inert>
        <NodeTitle nodeType="textPrompt" title="Prompt" muted action={<NodeTitleActions>
          <span className="node-title-action"><Minimize2 size={14} /></span>
          <span className="node-title-action"><Ellipsis size={14} /></span>
        </NodeTitleActions>} />
        <div className="text-prompt-body">
          <TextSectionFilterTags textField="text" text={preview.text} className="text-prompt-filter-tags" />
          <div className="text-prompt-main-box" style={{ height: 248 }}>
            <div className="text-prompt-variable-content">{preview.text}</div>
          </div>
          <div className="text-prompt-footer">
            <div className="text-prompt-footer-controls"><span className="text-concat-add-button"><Plus size={16} />Add variable</span></div>
          </div>
        </div>
        <span className="text-fragment-preview-port" />
        <span ref={hintRef} className="text-fragment-drop-hint">Создать Prompt</span>
      </article>
    </div>, document.body,
  );
});
