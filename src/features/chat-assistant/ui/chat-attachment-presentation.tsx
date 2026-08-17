'use client';

import type { ChatAttachmentUploadItem } from '@prodactionpro/chat-runtime-core';
import { ImagePlus, RotateCcw, X } from 'lucide-react';
import Image from 'next/image';
import type { ReactNode } from 'react';

export function AttachmentUploadTray({ items, onRemove, onRetry }: {
  items: ChatAttachmentUploadItem[];
  onRemove: (itemId: string) => void;
  onRetry: (itemId: string) => void;
}) {
  return (
    <ul aria-label="Вложения к сообщению" className="image-production-chat-attachment-uploads">
      {items.map((item) => (
        <li
          className="image-production-chat-attachment-item"
          data-status={item.status}
          key={item.id}
          title={item.file.name}
        >
          {item.previewUrl ? (
            <Image
              alt={item.file.name}
              className="image-production-chat-attachment-preview"
              draggable={false}
              height={72}
              src={item.previewUrl}
              unoptimized
              width={72}
            />
          ) : (
            <span className="image-production-chat-attachment-placeholder" aria-hidden="true">
              <ImagePlus size={22} strokeWidth={1.7} />
            </span>
          )}
          <button
            aria-label={`Удалить вложение ${item.file.name}`}
            className="image-production-chat-attachment-remove"
            onClick={() => onRemove(item.id)}
            title="Удалить вложение"
            type="button"
          >
            <X aria-hidden="true" size={13} strokeWidth={2.2} />
          </button>
          {item.status === 'failed' ? (
            <button
              aria-label={`Повторить загрузку ${item.file.name}`}
              className="image-production-chat-attachment-retry"
              onClick={() => onRetry(item.id)}
              title={item.error ?? 'Повторить загрузку'}
              type="button"
            >
              <RotateCcw aria-hidden="true" size={16} strokeWidth={2} />
            </button>
          ) : null}
          {item.status === 'queued' || item.status === 'uploading' ? (
            <progress
              aria-label={`Загрузка ${item.file.name}`}
              max={1}
              value={item.progress}
            />
          ) : null}
          <span className="image-production-chat-visually-hidden">
            {attachmentStatusLabel(item.status)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AssistantNotice({ action, actionLabel, children }: {
  action?: () => void;
  actionLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="assistant-chat-notice" role="status">
      <p>{children}</p>
      {action ? <button onClick={action} type="button">{actionLabel}</button> : null}
    </div>
  );
}

export function compactModelLabel(model: string) {
  return model.split('/').at(-1) ?? model;
}

function attachmentStatusLabel(status: ChatAttachmentUploadItem['status']) {
  switch (status) {
    case 'queued': return 'Ожидает загрузки';
    case 'uploading': return 'Загружается';
    case 'ready': return 'Готово';
    case 'failed': return 'Ошибка загрузки';
  }
}
