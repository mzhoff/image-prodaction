'use client';

import { CalendarDays, ClipboardCopy, Send } from 'lucide-react';
import { useCallback, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { toTelegramHtmlForClipboard, toTelegramPlainTextForClipboard } from '../../lib/telegram-html';
import type { useTelegramPublicationNodeModel } from '../../model/use-telegram-publication-node-model';
import { TelegramMessagePreview } from '../telegram-message-preview';
import { PublicationValidation } from '../telegram-publication-controls';
import { TelegramCollapsedInputPortRail } from '../telegram-publication-media-inputs';

interface Props {
  canPublish: boolean;
  model: ReturnType<typeof useTelegramPublicationNodeModel>;
  nodeId: string;
  onPublish: () => void;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
}

type CopyStatus = 'idle' | 'copied' | 'fallback' | 'error' | 'unsupported';

export function TelegramPublicationResultView({ canPublish, model, nodeId, onPublish, onStartConnection }: Props) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const hasMessage = model.messageText.trim().length > 0;
  const isCopying = copyStatus === 'copied' || copyStatus === 'fallback';
  const copyHtmlPayload = useCallback(async (html: string, plain: string) => {
    if (!navigator?.clipboard?.write || !('ClipboardItem' in window)) return false;
    const wrappedHtml = `<html><head><meta charset="UTF-8"></head><body>${html}</body></html>`;
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([wrappedHtml], { type: 'text/html' }),
      'text/plain': new Blob([plain], { type: 'text/plain' }),
    })]);
    return true;
  }, []);

  const handleCopyFormattedText = async () => {
    if (!hasMessage) return;
    const payload = { messageRichText: model.messageRichText, messageText: model.messageText };
    const html = toTelegramHtmlForClipboard(payload);
    const plain = toTelegramPlainTextForClipboard(payload);
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setCopyStatus('unsupported');
      return;
    }
    try {
      if (await copyHtmlPayload(html, plain) || copyHtmlLegacy(html)) setCopyStatus('copied');
      else if (!navigator.clipboard.writeText) setCopyStatus('unsupported');
      else {
        await navigator.clipboard.writeText(plain);
        setCopyStatus('fallback');
      }
    } catch {
      setCopyStatus('error');
    } finally {
      window.setTimeout(() => setCopyStatus('idle'), 1400);
    }
  };
  const statusLabel = getCopyStatusLabel(copyStatus);

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
      {statusLabel ? <p className="telegram-copy-status">{statusLabel}</p> : null}
      <div className="publication-node-actions">
        <button type="button" className="secondary-node-button publication-node-action-button" disabled>
          <CalendarDays size={16} /> Add to Plan
        </button>
        <button type="button" className="secondary-node-button publication-node-action-button" disabled={!hasMessage || isCopying} onClick={handleCopyFormattedText}>
          <ClipboardCopy size={16} /> {isCopying ? 'Копируем…' : 'Копировать текст'}
        </button>
        <button type="button" className="primary-node-button publication-node-action-button" disabled={!canPublish} onClick={onPublish}>
          <Send size={16} /> Publish
        </button>
      </div>
    </div>
  );
}

function copyHtmlLegacy(html: string) {
  const container = document.createElement('div');
  Object.assign(container.style, { position: 'fixed', opacity: '0', pointerEvents: 'none', left: '-9999px', top: '-9999px' });
  container.contentEditable = 'true';
  container.innerHTML = html;
  document.body.appendChild(container);
  const selection = window.getSelection();
  if (!selection) {
    container.remove();
    return false;
  }
  const range = document.createRange();
  range.selectNodeContents(container);
  selection.removeAllRanges();
  selection.addRange(range);
  const copied = document.execCommand('copy');
  selection.removeAllRanges();
  container.remove();
  return copied;
}

function getCopyStatusLabel(status: CopyStatus) {
  if (status === 'copied') return 'Скопировано';
  if (status === 'fallback') return 'Скопировано как plain text (ограничение браузера)';
  if (status === 'unsupported') return 'Копирование недоступно в этом браузере';
  if (status === 'error') return 'Не удалось скопировать';
  return '';
}
