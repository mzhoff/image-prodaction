'use client';

import { CalendarDays, ClipboardCopy, SearchCheck, Send, Type } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useState } from 'react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { TELEGRAM_MAX_MEDIA_ITEMS } from '../../lib/telegram-media-layout';
import { useNodeDisplayState } from '../../model/use-node-display-state';
import { useTelegramPublicationNodeModel } from '../../model/use-telegram-publication-node-model';
import { PortButton } from '../port-button';
import { TelegramMessageEditor } from '../telegram-message-editor';
import { TelegramMessagePreview } from '../telegram-message-preview';
import { TelegramPublicationDeliveryModal } from '../telegram-publication-delivery-modal';
import { PublicationActionButton, PublicationInputSection, PublicationValidation } from '../telegram-publication-controls';
import { PublicationInputMediaGrid, TelegramCollapsedInputPortRail, TelegramMediaInputPorts } from '../telegram-publication-media-inputs';
import { PublicationTabs, TelegramPublicationHeader, type PublicationView } from '../telegram-publication-header';
import { toTelegramHtmlForClipboard, toTelegramPlainTextForClipboard } from '../../lib/telegram-html';

interface TelegramPublicationNodeProps {
  node: ProductionNode;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
}

export function TelegramPublicationNode({ node, onStartConnection }: TelegramPublicationNodeProps) {
  const model = useTelegramPublicationNodeModel(node);
  const renameNode = useProductionGraphStore((state) => state.renameNode);
  const { isCollapsed: collapsed, setCollapsed } = useNodeDisplayState(node.id);
  const [activeView, setActiveView] = useState<PublicationView>('input');
  const [imagesOpen, setImagesOpen] = useState(true);
  const [textOpen, setTextOpen] = useState(true);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const canPublish = model.messageText.trim().length > 0 || model.imageInputs.length > 0;

  return (
    <>
      <TelegramPublicationHeader
        collapsed={collapsed}
        title={model.data.title}
        onRename={renameNode.bind(null, node.id)}
        contentUnitId={model.data.contentUnitId}
        onCollapsedChange={setCollapsed}
      />
      {collapsed ? (
        <TelegramCollapsedInputPortRail
          bodyConnected={model.textCount > 0}
          connectedMediaPortIds={model.connectedMediaPortIds}
          mediaSlotPortIds={model.mediaSlotPortIds}
          nodeId={node.id}
          onStartConnection={onStartConnection}
          mode="collapsed"
        />
      ) : null}
      {!collapsed ? (
        <>
          <PublicationTabs activeView={activeView} onViewChange={setActiveView} />
          {activeView === 'input' ? (
            <TelegramPublicationInputView
              imagesOpen={imagesOpen}
              model={model}
              nodeId={node.id}
              onImagesOpenChange={setImagesOpen}
              onStartConnection={onStartConnection}
              onTextOpenChange={setTextOpen}
              textOpen={textOpen}
            />
          ) : (
            <TelegramPublicationResultView
              model={model}
              nodeId={node.id}
              onStartConnection={onStartConnection}
              canPublish={canPublish}
              onPublish={() => setDeliveryOpen(true)}
            />
          )}
          {model.data.message ? <div className="node-note node-note-compact publication-node-message">{model.data.message}</div> : null}
          {deliveryOpen ? (
            <TelegramPublicationDeliveryModal
              mediaItems={model.imageInputs}
              messageCharacterLimit={model.telegramCharacterLimit}
              messageLength={model.telegramMessageLength}
              messageRichText={model.messageRichText}
              messageText={model.messageText}
              onClose={() => setDeliveryOpen(false)}
              open={deliveryOpen}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}

function TelegramPublicationInputView({
  imagesOpen,
  model,
  nodeId,
  onImagesOpenChange,
  onStartConnection,
  onTextOpenChange,
  textOpen,
}: {
  imagesOpen: boolean;
  model: ReturnType<typeof useTelegramPublicationNodeModel>;
  nodeId: string;
  onImagesOpenChange: (isOpen: boolean) => void;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onTextOpenChange: (isOpen: boolean) => void;
  textOpen: boolean;
}) {
  return (
    <div className="publication-node-panel publication-node-input-panel">
      <PublicationInputSection
        countLabel={`${Math.min(model.imageCount, TELEGRAM_MAX_MEDIA_ITEMS)}/${TELEGRAM_MAX_MEDIA_ITEMS}`}
        headerPort={!imagesOpen ? (
          <TelegramMediaInputPorts
            collapsed
            connectedMediaPortIds={model.connectedMediaPortIds}
            mediaSlotPortIds={model.mediaSlotPortIds}
            nodeId={nodeId}
            onStartConnection={onStartConnection}
          />
        ) : null}
        isOpen={imagesOpen}
        kind="image"
        label="Images"
        onOpenChange={onImagesOpenChange}
      >
        <TelegramMediaInputPorts
          connectedMediaPortIds={model.connectedMediaPortIds}
          mediaSlotPortIds={model.mediaSlotPortIds}
          nodeId={nodeId}
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
            nodeId={nodeId}
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
        onOpenChange={onTextOpenChange}
      >
        <PortButton
          nodeId={nodeId}
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
          characterLimit={model.telegramCharacterLimit}
          value={model.messageText}
          onChange={model.handleMessageTextChange}
        />
      </PublicationInputSection>
      <PublicationActionButton
        disabled={model.formatDisabled}
        icon={<Type size={18} />}
        label="Formate Text"
        nodeId={nodeId}
        onClick={model.handleFormatMessage}
        onStartConnection={onStartConnection}
        portId="formatRules"
        portLabel="Format rules"
      />
      <PublicationActionButton
        icon={<SearchCheck size={18} />}
        label="Check"
        nodeId={nodeId}
        onStartConnection={onStartConnection}
        portId="checkRules"
        portLabel="Check rules"
      />
    </div>
  );
}

function TelegramPublicationResultView({
  model,
  nodeId,
  onStartConnection,
  canPublish,
  onPublish,
}: {
  model: ReturnType<typeof useTelegramPublicationNodeModel>;
  nodeId: string;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  canPublish: boolean;
  onPublish: () => void;
}) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'fallback' | 'error' | 'unsupported'>('idle');

  const hasMessage = model.messageText.trim().length > 0;
  const isCopying = copyStatus === 'copied' || copyStatus === 'fallback';

  const copyHtmlPayload = useCallback(async (html: string, plain: string) => {
    const wrappedHtml = `<html><head><meta charset=\"UTF-8\"></head><body>${html}</body></html>`;
    if (!navigator?.clipboard || !navigator.clipboard.write) return false;

    if ('ClipboardItem' in window) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([wrappedHtml], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ]);
      return true;
    }

    return false;
  }, []);

  const copyHtmlLegacy = useCallback((html: string) => {
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.opacity = '0';
    container.style.pointerEvents = 'none';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.contentEditable = 'true';
    container.setAttribute('data-copy-host', 'telegram-message-copy');
    container.innerHTML = html;
    document.body.appendChild(container);

    const selection = window.getSelection();
    if (!selection) {
      document.body.removeChild(container);
      return false;
    }

    const range = document.createRange();
    range.selectNodeContents(container);
    selection.removeAllRanges();
    selection.addRange(range);

    const copied = document.execCommand('copy');
    selection.removeAllRanges();
    document.body.removeChild(container);

    return copied;
  }, []);

  const handleCopyFormattedText = async () => {
    if (!hasMessage) return;

    const html = toTelegramHtmlForClipboard({
      messageRichText: model.messageRichText,
      messageText: model.messageText,
    });
    const plain = toTelegramPlainTextForClipboard({
      messageRichText: model.messageRichText,
      messageText: model.messageText,
    });

    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setCopyStatus('unsupported');
      return;
    }

    try {
      const copiedWithApi = await copyHtmlPayload(html, plain);
      if (copiedWithApi) {
        setCopyStatus('copied');
        return;
      }

      const copiedLegacy = copyHtmlLegacy(html);
      if (copiedLegacy) {
        setCopyStatus('copied');
        return;
      }

      if (typeof navigator === 'undefined' || !navigator.clipboard || !navigator.clipboard.writeText) {
        setCopyStatus('unsupported');
        return;
      }

      await navigator.clipboard.writeText(plain);
      setCopyStatus('fallback');
    } catch (error) {
      setCopyStatus('error');
      return;
    } finally {
      window.setTimeout(() => {
        setCopyStatus('idle');
      }, 1400);
    }
  };
  const statusLabel = copyStatus === 'copied'
    ? 'Скопировано'
    : copyStatus === 'fallback'
      ? 'Скопировано как plain text (ограничение браузера)'
      : copyStatus === 'unsupported'
        ? 'Копирование недоступно в этом браузере'
        : copyStatus === 'error'
          ? 'Не удалось скопировать'
          : '';

  return (
    <div className="publication-node-panel publication-node-result-panel">
      <TelegramCollapsedInputPortRail
        bodyConnected={model.textCount > 0}
        connectedMediaPortIds={model.connectedMediaPortIds}
        mediaSlotPortIds={model.mediaSlotPortIds}
        nodeId={nodeId}
        onStartConnection={onStartConnection}
        mode="result"
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
        messageLength={model.telegramMessageLength}
        messageCharacterLimit={model.telegramCharacterLimit}
        mediaOverflow={model.hasMediaOverflow}
        validation={model.validation}
      />
      {statusLabel ? (
        <p className="telegram-copy-status">
          {statusLabel}
        </p>
      ) : null}
      <div className="publication-node-actions">
        <button type="button" className="secondary-node-button publication-node-action-button" disabled>
          <CalendarDays size={16} />
          Add to Plan
        </button>
        <button
          type="button"
          className="secondary-node-button publication-node-action-button"
          disabled={!hasMessage || isCopying}
          onClick={handleCopyFormattedText}
        >
          <ClipboardCopy size={16} />
          {isCopying ? 'Копируем…' : 'Копировать текст'}
        </button>
        <button
          type="button"
          className="primary-node-button publication-node-action-button"
          disabled={!canPublish}
          onClick={onPublish}
        >
          <Send size={16} />
          Publish
        </button>
      </div>
    </div>
  );
}
