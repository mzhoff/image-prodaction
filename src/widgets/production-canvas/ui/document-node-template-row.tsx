'use client';

import { LayoutTemplate } from '@prodactionpro/ui-core/icons';
import type { DragEvent } from 'react';
import {
  type NodeTemplatePreset,
} from '@/entities/production-graph/model/node-template-preset';
import { getNodeTemplatePresentation } from '@/entities/production-graph/model/node-template-presentation';
import { NODE_TEMPLATE_DRAG_MIME_TYPE } from '../lib/node-drag';

export function DocumentNodeTemplateRow({ onCreateTemplateNode, template }: {
  onCreateTemplateNode: (templateId: string) => void;
  template: NodeTemplatePreset;
}) {
  const presentation = getNodeTemplatePresentation(template);
  const inputLabel = `${presentation.inputCount} input${presentation.inputCount === 1 ? '' : 's'}`;

  const handleDragStart = (event: DragEvent<HTMLButtonElement>) => {
    event.dataTransfer.setData(NODE_TEMPLATE_DRAG_MIME_TYPE, template.id);
    event.dataTransfer.effectAllowed = 'copy';
    const preview = event.currentTarget.cloneNode(true) as HTMLElement;
    preview.classList.add('document-node-palette-drag-preview');
    document.body.appendChild(preview);
    event.dataTransfer.setDragImage(preview, 36, 28);
    window.setTimeout(() => preview.remove(), 0);
  };

  return (
    <button
      aria-label={`Add template ${presentation.title}`}
      className="document-node-palette-template-row"
      draggable
      onClick={() => onCreateTemplateNode(template.id)}
      onDragStart={handleDragStart}
      type="button"
    >
      <span className="document-node-palette-template-icon"><LayoutTemplate size={18} /></span>
      <span className="document-node-palette-template-content">
        <strong>{presentation.title}</strong>
        <span className="document-node-palette-template-meta">
          {presentation.typeLabel} · {inputLabel}
        </span>
        {presentation.detailLines.slice(0, 2).map((detail) => (
          <span className="document-node-palette-template-detail" key={detail}>{detail}</span>
        ))}
      </span>
    </button>
  );
}
