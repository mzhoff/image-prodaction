'use client';

import { Trash2 } from 'lucide-react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useMemo, useState } from 'react';
import { useAssetUrl } from '@/entities/production-graph/model/use-asset-url';
import { getTelegramMediaLayout, TELEGRAM_MAX_MEDIA_ITEMS } from '../lib/telegram-media-layout';
import type { TelegramPreviewMediaItem } from '../model/use-telegram-publication-node-model';
import { PortButton } from './port-button';

const RESULT_MEDIA_PORT_TOP = 116;
const RESULT_BODY_PORT_TOP = 168;
const RESULT_FORMAT_RULES_PORT_TOP = 216;
const RESULT_CHECK_RULES_PORT_TOP = 264;
const MEDIA_PORT_TOP = 40;
const MEDIA_PORT_STEP = 40;
const PUBLICATION_COLLAPSED_PORT_TOP = 20;

export function TelegramMediaInputPorts({
  collapsed = false,
  connectedMediaPortIds,
  mediaSlotPortIds,
  nodeId,
  onStartConnection,
}: {
  collapsed?: boolean;
  connectedMediaPortIds: string[];
  mediaSlotPortIds: string[];
  nodeId: string;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const connectedMediaPortSet = useMemo(() => new Set(connectedMediaPortIds), [connectedMediaPortIds]);

  return (
    <>
      {mediaSlotPortIds.map((portId, index) => {
        const portConnected = connectedMediaPortSet.has(portId);
        return (
          <PortButton
            key={portId}
            nodeId={nodeId}
            portId={portId}
            side="input"
            kind="image"
            label={`Image ${index + 1}`}
            className={collapsed
              ? 'publication-section-header-port publication-media-collapsed-port'
              : 'publication-media-slot-port'}
            connectionState={portConnected ? 'image' : 'empty'}
            style={collapsed
              ? { top: PUBLICATION_COLLAPSED_PORT_TOP, zIndex: index + 1 }
              : { top: getMediaPortTop(index) }}
            onStartConnection={onStartConnection}
          />
        );
      })}
    </>
  );
}

export function TelegramCollapsedInputPortRail({
  bodyConnected,
  connectedMediaPortIds,
  mediaSlotPortIds,
  nodeId,
  onStartConnection,
  mode = 'result',
}: {
  bodyConnected: boolean;
  connectedMediaPortIds: string[];
  mediaSlotPortIds: string[];
  nodeId: string;
  mode?: 'collapsed' | 'result';
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const connectedMediaPortSet = useMemo(() => new Set(connectedMediaPortIds), [connectedMediaPortIds]);
  const isCollapsed = mode === 'collapsed';
  const mediaPortTop = isCollapsed ? PUBLICATION_COLLAPSED_PORT_TOP : RESULT_MEDIA_PORT_TOP;
  const mediaPortClassName = isCollapsed ? 'publication-section-header-port' : 'publication-result-rail-port';
  const textPortClassName = isCollapsed ? 'publication-section-header-port' : 'publication-result-rail-port';
  const textPortTop = (baseTop: number) => (isCollapsed ? PUBLICATION_COLLAPSED_PORT_TOP : baseTop);

  return (
    <div className="publication-result-port-layer" aria-hidden={false}>
      {mediaSlotPortIds.map((portId, index) => (
        <PortButton
          key={portId}
          nodeId={nodeId}
          portId={portId}
          side="input"
          kind="image"
          label={`Image ${index + 1}`}
          className={mediaPortClassName}
          connectionState={connectedMediaPortSet.has(portId) ? 'image' : 'empty'}
          style={{ top: mediaPortTop, zIndex: index + 1 }}
          onStartConnection={onStartConnection}
        />
      ))}
      <PortButton
        nodeId={nodeId}
        portId="body"
        side="input"
        kind="text"
        label="Text blocks"
        className={textPortClassName}
        connectionState={bodyConnected ? 'text' : undefined}
        style={{ top: textPortTop(RESULT_BODY_PORT_TOP) }}
        onStartConnection={onStartConnection}
      />
      <PortButton
        nodeId={nodeId}
        portId="formatRules"
        side="input"
        kind="text"
        label="Format rules"
        className={textPortClassName}
        style={{ top: textPortTop(RESULT_FORMAT_RULES_PORT_TOP) }}
        onStartConnection={onStartConnection}
      />
      <PortButton
        nodeId={nodeId}
        portId="checkRules"
        side="input"
        kind="text"
        label="Check rules"
        className={textPortClassName}
        style={{ top: textPortTop(RESULT_CHECK_RULES_PORT_TOP) }}
        onStartConnection={onStartConnection}
      />
    </div>
  );
}

export function PublicationInputMediaGrid({
  items,
  onRemove,
  onReorder,
}: {
  items: TelegramPreviewMediaItem[];
  onRemove: (edgeId?: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}) {
  const visibleItems = items.slice(0, TELEGRAM_MAX_MEDIA_ITEMS);
  const layout = useMemo(() => getTelegramMediaLayout(Math.max(1, visibleItems.length)), [visibleItems.length]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const style: CSSProperties = {
    aspectRatio: layout.aspectRatio,
    gridTemplateAreas: layout.template,
    gridTemplateColumns: layout.columns,
    gridTemplateRows: layout.rows,
  };
  const cells = visibleItems.length > 0
    ? visibleItems
    : [{ asset: undefined, assetId: 'empty' }];

  return (
    <div className="publication-input-media-grid" style={style} data-node-interactive>
      {cells.map((item, index) => (
        <PublicationInputMediaCell
          key={item.assetId}
          area={layout.areas[index]}
          dragIndex={dragIndex}
          index={index}
          item={item.asset ? item as TelegramPreviewMediaItem : undefined}
          onDragIndexChange={setDragIndex}
          onRemove={onRemove}
          onReorder={onReorder}
        />
      ))}
    </div>
  );
}

function PublicationInputMediaCell({
  area,
  dragIndex,
  index,
  item,
  onDragIndexChange,
  onRemove,
  onReorder,
}: {
  area: string;
  dragIndex: number | null;
  index: number;
  item?: TelegramPreviewMediaItem;
  onDragIndexChange: (index: number | null) => void;
  onRemove: (edgeId?: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}) {
  const url = useAssetUrl(item?.assetId);

  return (
    <div
      className={dragIndex === index ? 'publication-input-media-cell publication-input-media-cell-dragging' : 'publication-input-media-cell'}
      draggable={Boolean(url)}
      style={{ gridArea: area }}
      onDragStart={(event) => {
        if (!url || !item) return;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', item.assetId);
        onDragIndexChange(index);
      }}
      onDragOver={(event) => {
        if (dragIndex === null || dragIndex === index) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (dragIndex !== null && dragIndex !== index) onReorder(dragIndex, index);
        onDragIndexChange(null);
      }}
      onDragEnd={() => onDragIndexChange(null)}
      data-node-interactive
      aria-label={item ? `Image ${index + 1}` : 'Empty image slot'}
    >
      {url && item ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={item.asset.name} draggable={false} />
          <button
            type="button"
            className="publication-input-media-remove"
            aria-label="Remove image connection"
            title="Remove image"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(item.edgeId);
            }}
            data-node-interactive
          >
            <Trash2 size={14} />
          </button>
        </>
      ) : (
        <span className="publication-input-media-empty" />
      )}
    </div>
  );
}

function getMediaPortTop(index: number) {
  return MEDIA_PORT_TOP + index * MEDIA_PORT_STEP;
}
