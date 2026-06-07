'use client';

import { CalendarDays, ChevronDown, ChevronUp, Ellipsis, Images, Maximize2, PanelsTopLeft, SearchCheck, Send, Trash2, Type } from 'lucide-react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useAssetUrl } from '@/entities/production-graph/model/use-asset-url';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { TelegramMessageEditor } from '../telegram-message-editor';
import { TelegramMessagePreview } from '../telegram-message-preview';
import { getTelegramMediaLayout, TELEGRAM_MAX_MEDIA_ITEMS } from '../../lib/telegram-media-layout';
import { type TelegramPreviewMediaItem, useTelegramPublicationNodeModel } from '../../model/use-telegram-publication-node-model';
import { PortButton } from '../port-button';

interface TelegramPublicationNodeProps {
  node: ProductionNode;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
}

type PublicationView = 'input' | 'result';

interface PublicationFormatOption {
  id: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
}

const TELEGRAM_FORMAT_OPTIONS: PublicationFormatOption[] = [
  { id: 'telegram-post', label: 'Post', icon: <Send size={14} /> },
  { id: 'telegram-media-album', label: 'Media album', icon: <Images size={14} />, disabled: true },
  { id: 'telegram-story', label: 'Story', icon: <PanelsTopLeft size={14} />, disabled: true },
];

const RESULT_MEDIA_PORT_TOP = 116;
const RESULT_BODY_PORT_TOP = 168;
const RESULT_FORMAT_RULES_PORT_TOP = 216;
const RESULT_CHECK_RULES_PORT_TOP = 264;
const MEDIA_PORT_TOP = 40;
const MEDIA_PORT_STEP = 40;

export function TelegramPublicationNode({ node, onStartConnection }: TelegramPublicationNodeProps) {
  const model = useTelegramPublicationNodeModel(node);
  const [collapsed, setCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<PublicationView>('input');
  const [imagesOpen, setImagesOpen] = useState(true);
  const [textOpen, setTextOpen] = useState(true);

  return (
    <>
      <TelegramPublicationHeader
        collapsed={collapsed}
        contentUnitId={model.data.contentUnitId}
        onCollapsedChange={setCollapsed}
      />
      {!collapsed ? (
        <>
          <PublicationTabs activeView={activeView} onViewChange={setActiveView} />
          {activeView === 'input' ? (
            <div className="publication-node-panel publication-node-input-panel">
              <PublicationInputSection
                countLabel={`${Math.min(model.imageCount, TELEGRAM_MAX_MEDIA_ITEMS)}/${TELEGRAM_MAX_MEDIA_ITEMS}`}
                headerPort={!imagesOpen ? (
                  <TelegramMediaInputPorts
                    collapsed
                    connectedMediaPortIds={model.connectedMediaPortIds}
                    mediaSlotPortIds={model.mediaSlotPortIds}
                    nodeId={node.id}
                    onStartConnection={onStartConnection}
                  />
                ) : null}
                isOpen={imagesOpen}
                kind="image"
                label="Images"
                onOpenChange={setImagesOpen}
              >
                <TelegramMediaInputPorts
                  connectedMediaPortIds={model.connectedMediaPortIds}
                  mediaSlotPortIds={model.mediaSlotPortIds}
                  nodeId={node.id}
                  onStartConnection={onStartConnection}
                />
                <PublicationInputMediaGrid
                  items={model.previewMediaItems}
                  onRemove={model.handleMediaRemove}
                  onReorder={model.handleMediaReorder}
                />
              </PublicationInputSection>
              <PublicationInputSection
                countLabel={model.textCount > 0 ? `${model.textCount} text` : ''}
                headerPort={!textOpen ? (
                  <PortButton
                    nodeId={node.id}
                    portId="body"
                    side="input"
                    kind="text"
                    label="Text blocks"
                    className="publication-section-header-port"
                    connectionState={model.textCount > 0 ? 'text' : undefined}
                    onStartConnection={onStartConnection}
                  />
                ) : null}
                isOpen={textOpen}
                kind="text"
                label="Text"
                onOpenChange={setTextOpen}
              >
                <PortButton
                  nodeId={node.id}
                  portId="body"
                  side="input"
                  kind="text"
                  label="Text blocks"
                  className="publication-section-body-port"
                  connectionState={model.textCount > 0 ? 'text' : undefined}
                  onStartConnection={onStartConnection}
                />
                <TelegramMessageEditor
                  richText={model.messageRichText}
                  value={model.messageText}
                  onChange={model.handleMessageTextChange}
                />
              </PublicationInputSection>
              <PublicationActionButton
                disabled={model.formatDisabled}
                icon={<Type size={18} />}
                label="Formate Text"
                nodeId={node.id}
                onClick={model.handleFormatMessage}
                onStartConnection={onStartConnection}
                portId="formatRules"
                portLabel="Format rules"
              />
              <PublicationActionButton
                icon={<SearchCheck size={18} />}
                label="Check"
                nodeId={node.id}
                onStartConnection={onStartConnection}
                portId="checkRules"
                portLabel="Check rules"
              />
            </div>
          ) : (
            <div className="publication-node-panel publication-node-result-panel">
              <TelegramCollapsedInputPortRail
                bodyConnected={model.textCount > 0}
                connectedMediaPortIds={model.connectedMediaPortIds}
                mediaSlotPortIds={model.mediaSlotPortIds}
                nodeId={node.id}
                onStartConnection={onStartConnection}
              />
              <TelegramMessagePreview
                messageRichText={model.messageRichText}
                messageText={model.messageText}
                mediaOverflowCount={model.mediaOverflowCount}
                mediaItems={model.previewMediaItems}
                onMediaReorder={model.handleMediaReorder}
              />
              <PublicationValidation
                imageCount={model.imageCount}
                mediaOverflow={model.hasMediaOverflow}
                validation={model.validation}
              />
              <div className="publication-node-actions">
                <button type="button" className="secondary-node-button publication-node-action-button" disabled>
                  <CalendarDays size={16} />
                  Add to Plan
                </button>
                <button type="button" className="primary-node-button publication-node-action-button" disabled>
                  <Send size={16} />
                  Publish
                </button>
              </div>
            </div>
          )}
          {model.data.message ? <div className="node-note node-note-compact publication-node-message">{model.data.message}</div> : null}
        </>
      ) : null}
    </>
  );
}

function TelegramPublicationHeader({
  collapsed,
  contentUnitId,
  onCollapsedChange,
}: {
  collapsed: boolean;
  contentUnitId: string;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  return (
    <div className="publication-node-header" data-node-drag-handle>
      <span className="publication-platform-icon" aria-hidden="true">
        <TelegramLogoIcon size={14} />
      </span>
      <span className="publication-node-channel-name">Telegram</span>
      <PublicationFormatSelector value={contentUnitId} />
      <button
        type="button"
        className="publication-node-header-action"
        aria-label={collapsed ? 'Expand node' : 'Collapse node'}
        onClick={() => onCollapsedChange(!collapsed)}
        data-node-interactive
      >
        <Maximize2 size={16} />
      </button>
      <button
        type="button"
        className="publication-node-header-action"
        aria-label="Node options"
        data-node-interactive
      >
        <Ellipsis size={16} />
      </button>
    </div>
  );
}

function TelegramLogoIcon({ size }: { size: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M21.7 3.7 3.2 10.8c-1 .4-1 1.8.1 2.1l4.7 1.5 1.8 5.3c.3.9 1.5 1.1 2.1.4l2.6-2.7 4.8 3.5c.8.6 1.9.1 2.1-.9l3-14.6c.2-1.1-.8-2-1.8-1.7Zm-4.5 4.5-7.8 7.1-.4 3.1-1-3.7 9.2-6.5Z"
      />
    </svg>
  );
}

function PublicationFormatSelector({ value }: { value: string }) {
  const [open, setOpen] = useState(false);
  const selected = TELEGRAM_FORMAT_OPTIONS.find((option) => option.id === value) ?? TELEGRAM_FORMAT_OPTIONS[0];

  return (
    <div
      className={open ? 'publication-format-menu publication-format-menu-open' : 'publication-format-menu'}
      onBlur={(event) => {
        const nextFocus = event.relatedTarget;
        if (!(nextFocus instanceof Node) || !event.currentTarget.contains(nextFocus)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="publication-format-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="publication-format-trigger-icon" aria-hidden="true">{selected.icon}</span>
        <span>{selected.label}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open ? (
        <div className="publication-format-popover" role="menu">
          {TELEGRAM_FORMAT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={option.id === selected.id ? 'publication-format-option publication-format-option-active' : 'publication-format-option'}
              disabled={option.disabled}
              role="menuitem"
              onClick={() => {
                if (!option.disabled) setOpen(false);
              }}
            >
              <span className="publication-format-option-icon" aria-hidden="true">{option.icon}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TelegramMediaInputPorts({
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
  const hasConnectedMedia = connectedMediaPortIds.length > 0;

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
            connectionState={collapsed
              ? hasConnectedMedia ? 'image' : 'empty'
              : portConnected ? 'image' : 'empty'}
            style={collapsed
              ? { zIndex: index + 1 }
              : { top: getMediaPortTop(index) }}
            onStartConnection={onStartConnection}
          />
        );
      })}
    </>
  );
}

function TelegramCollapsedInputPortRail({
  bodyConnected,
  connectedMediaPortIds,
  mediaSlotPortIds,
  nodeId,
  onStartConnection,
}: {
  bodyConnected: boolean;
  connectedMediaPortIds: string[];
  mediaSlotPortIds: string[];
  nodeId: string;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const hasConnectedMedia = connectedMediaPortIds.length > 0;

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
          className="publication-result-rail-port"
          connectionState={hasConnectedMedia ? 'image' : 'empty'}
          style={{ top: RESULT_MEDIA_PORT_TOP, zIndex: index + 1 }}
          onStartConnection={onStartConnection}
        />
      ))}
      <PortButton
        nodeId={nodeId}
        portId="body"
        side="input"
        kind="text"
        label="Text blocks"
        className="publication-result-rail-port"
        connectionState={bodyConnected ? 'text' : undefined}
        style={{ top: RESULT_BODY_PORT_TOP }}
        onStartConnection={onStartConnection}
      />
      <PortButton
        nodeId={nodeId}
        portId="formatRules"
        side="input"
        kind="text"
        label="Format rules"
        className="publication-result-rail-port"
        style={{ top: RESULT_FORMAT_RULES_PORT_TOP }}
        onStartConnection={onStartConnection}
      />
      <PortButton
        nodeId={nodeId}
        portId="checkRules"
        side="input"
        kind="text"
        label="Check rules"
        className="publication-result-rail-port"
        style={{ top: RESULT_CHECK_RULES_PORT_TOP }}
        onStartConnection={onStartConnection}
      />
    </div>
  );
}

function getMediaPortTop(index: number) {
  return MEDIA_PORT_TOP + index * MEDIA_PORT_STEP;
}

function PublicationTabs({
  activeView,
  onViewChange,
}: {
  activeView: PublicationView;
  onViewChange: (view: PublicationView) => void;
}) {
  return (
    <div className="publication-node-tabs" data-node-interactive>
      <button
        type="button"
        className={activeView === 'input' ? 'publication-node-tab publication-node-tab-active' : 'publication-node-tab'}
        onClick={() => onViewChange('input')}
      >
        Input
      </button>
      <button
        type="button"
        className={activeView === 'result' ? 'publication-node-tab publication-node-tab-active' : 'publication-node-tab'}
        onClick={() => onViewChange('result')}
      >
        Result
      </button>
    </div>
  );
}

function PublicationInputSection({
  children,
  countLabel,
  headerPort,
  isOpen,
  kind,
  label,
  onOpenChange,
}: {
  children: ReactNode;
  countLabel?: string;
  headerPort?: ReactNode;
  isOpen: boolean;
  kind: 'image' | 'text';
  label: string;
  onOpenChange: (isOpen: boolean) => void;
}) {
  return (
    <section className={`publication-input-section publication-input-section-${kind}`}>
      <div className="publication-input-section-header">
        {headerPort}
        <span>{label}</span>
        {countLabel ? <span className="publication-input-count">{countLabel}</span> : null}
        <button
          type="button"
          className="publication-input-section-toggle"
          aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${label}`}
          onClick={() => onOpenChange(!isOpen)}
          data-node-interactive
        >
          <ChevronUp size={16} className={isOpen ? undefined : 'publication-input-section-toggle-closed'} />
        </button>
      </div>
      {isOpen ? (
        <div className="publication-input-section-body">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function PublicationInputMediaGrid({
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

function PublicationActionButton({
  disabled,
  icon,
  label,
  nodeId,
  onClick,
  onStartConnection,
  portId,
  portLabel,
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  nodeId: string;
  onClick?: () => void;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  portId: string;
  portLabel: string;
}) {
  const isDisabled = disabled ?? !onClick;

  return (
    <div className="publication-node-action-row">
      <PortButton
        nodeId={nodeId}
        portId={portId}
        side="input"
        kind="text"
        label={portLabel}
        className="publication-action-input-port"
        onStartConnection={onStartConnection}
      />
      <button
        type="button"
        className="secondary-node-button publication-node-action-button"
        disabled={isDisabled}
        onClick={onClick}
        data-node-interactive
      >
        {icon}
        {label}
      </button>
    </div>
  );
}

function PublicationValidation({
  imageCount,
  mediaOverflow,
  validation,
}: {
  imageCount: number;
  mediaOverflow: boolean;
  validation: ReturnType<typeof useTelegramPublicationNodeModel>['validation'];
}) {
  return (
    <div className="publication-node-validation">
      <div className="publication-node-metrics">
        <span>{validation.metrics.bodyLength}/4096</span>
        <span>{imageCount}/{TELEGRAM_MAX_MEDIA_ITEMS} media</span>
        <span>{validation.metrics.hashtagCount} tag</span>
      </div>
      {validation.issues.length > 0 || mediaOverflow ? (
        <div className="publication-node-issues">
          {mediaOverflow ? (
            <div className="publication-node-issue publication-node-issue-error">
              Telegram supports up to {TELEGRAM_MAX_MEDIA_ITEMS} media items in one album.
            </div>
          ) : null}
          {validation.issues.slice(0, 3).map((issue) => (
            <div key={issue.id} className={`publication-node-issue publication-node-issue-${issue.severity}`}>
              {issue.message}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
