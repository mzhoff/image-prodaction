'use client';

import { Minus } from 'lucide-react';
import type { DragEvent, ReactNode } from 'react';
import { useState } from 'react';
import type { ProductionNodeType } from '@/entities/production-graph/model/types';
import { useScrollableWheel } from '@/shared/ui/use-scrollable-wheel';
import { addNodeMenuGroups } from '../lib/add-node-menu';
import type { AddNodeMenuEntry } from '../lib/add-node-menu';
import { NODE_DRAG_MIME_TYPE } from '../lib/node-drag';

interface PaletteNode {
  disabled?: boolean;
  icon?: ReactNode;
  id: string;
  label: string;
  type?: ProductionNodeType;
}

interface DocumentNodePaletteProps {
  onClose: () => void;
  onCreateNode: (type: ProductionNodeType) => void;
  open: boolean;
}

type PaletteTab = 'tools' | 'templates' | 'favorite';

const paletteTabs: Array<{ id: PaletteTab; label: string }> = [
  { id: 'tools', label: 'Tools' },
  { id: 'templates', label: 'Templates' },
  { id: 'favorite', label: 'Favorite' },
];

export function DocumentNodePalette({ onClose, onCreateNode, open }: DocumentNodePaletteProps) {
  const [activeTab, setActiveTab] = useState<PaletteTab>('tools');
  const handleWheel = useScrollableWheel<HTMLDivElement>();

  return (
    <aside className={`document-node-palette ${open ? 'document-node-palette-open' : ''}`} aria-hidden={!open} aria-label="Document tools">
      <div className="document-node-palette-tabs" role="tablist" aria-label="Palette sections">
        {paletteTabs.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className={`document-node-palette-tab ${activeTab === tab.id ? 'document-node-palette-tab-active' : ''}`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
        <button className="document-node-palette-minimize" type="button" aria-label="Minimize node palette" onClick={onClose}>
          <Minus size={16} />
        </button>
      </div>
      <div className="document-node-palette-divider" />
      <div className="document-node-palette-scroll" onWheelCapture={handleWheel}>
        {activeTab === 'tools' ? (
          addNodeMenuGroups.map((group) => (
            <section className="document-node-palette-group" key={group.id}>
              <h2>{group.label}</h2>
              <div className="document-node-palette-grid">
                {flattenPaletteNodes(group.items).map((item) => (
                  <NodePaletteCard item={item} key={item.id} onCreateNode={onCreateNode} />
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className="document-node-palette-empty">
            <strong>{activeTab === 'templates' ? 'Templates' : 'Favorite'}</strong>
            <span>This section is ready for custom node collections.</span>
          </div>
        )}
      </div>
    </aside>
  );
}

function NodePaletteCard({
  item,
  onCreateNode,
}: {
  item: PaletteNode;
  onCreateNode: (type: ProductionNodeType) => void;
}) {
  const draggable = Boolean(item.type && !item.disabled);

  const handleDragStart = (event: DragEvent<HTMLButtonElement>) => {
    if (!item.type || item.disabled) return;
    event.dataTransfer.setData(NODE_DRAG_MIME_TYPE, item.type);
    event.dataTransfer.effectAllowed = 'copy';
    attachDragPreview(event.currentTarget, event);
  };

  return (
    <button
      className={`document-node-palette-card ${item.disabled ? 'document-node-palette-card-disabled' : ''}`}
      draggable={draggable}
      type="button"
      disabled={item.disabled || !item.type}
      onClick={() => {
        if (item.type && !item.disabled) onCreateNode(item.type);
      }}
      onDragStart={handleDragStart}
    >
      {item.icon}
      <span>{item.label}</span>
    </button>
  );
}

function flattenPaletteNodes(items: AddNodeMenuEntry[], prefix = ''): PaletteNode[] {
  return items.flatMap((item) => {
    if ('items' in item) {
      return flattenPaletteNodes(item.items, item.label);
    }

    const label = prefix ? `${prefix}: ${item.label}` : item.label;
    if ('type' in item) {
      return [{
        icon: item.icon,
        id: item.type,
        label,
        type: item.type,
      }];
    }

    return [{
      disabled: true,
      icon: item.icon,
      id: item.id,
      label,
    }];
  });
}

function attachDragPreview(source: HTMLElement, event: DragEvent<HTMLElement>) {
  const preview = source.cloneNode(true) as HTMLElement;
  preview.classList.add('document-node-palette-drag-preview');
  document.body.appendChild(preview);
  event.dataTransfer.setDragImage(preview, 50, 50);
  window.setTimeout(() => preview.remove(), 0);
}
