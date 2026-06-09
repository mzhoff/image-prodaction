'use client';

import { CheckCircle2, ExternalLink, Loader2, Plus, Send, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { loadAssetBlob } from '@/entities/production-graph/lib/asset-db';
import { sendTelegramPost, verifyTelegramChannel } from '@/shared/api/telegram-client';
import type { TelegramPreviewMediaItem } from '../model/use-telegram-publication-node-model';
import {
  loadSavedTelegramChannels,
  removeTelegramChannel,
  saveTelegramChannel,
  type TelegramChannelRecord,
} from '../lib/telegram-channel-store';
import { toTelegramHtmlFromEditor } from '../lib/telegram-html';
import { TELEGRAM_MAX_MEDIA_ITEMS } from '../lib/telegram-media-layout';

const STATUS_AUTO_HIDE_MS = 1000;

interface TelegramPublicationDeliveryModalProps {
  mediaItems: TelegramPreviewMediaItem[];
  messageCharacterLimit: number;
  messageLength: number;
  messageRichText?: string;
  messageText: string;
  onClose: () => void;
  open: boolean;
}

type DeliveryStep = 'select' | 'add';

type ModalStatusSeverity = 'error' | 'info' | 'success' | 'warning';

interface TelegramDeliveryModalStatus {
  message: string;
  severity: ModalStatusSeverity;
}

export function TelegramPublicationDeliveryModal({
  mediaItems,
  messageCharacterLimit,
  messageLength,
  messageRichText,
  messageText,
  onClose,
  open,
}: TelegramPublicationDeliveryModalProps) {
  const [channels, setChannels] = useState<TelegramChannelRecord[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [inputChannel, setInputChannel] = useState('');
  const [step, setStep] = useState<DeliveryStep>('select');
  const [status, setStatus] = useState<TelegramDeliveryModalStatus | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [postUrl, setPostUrl] = useState('');

  const hasMedia = mediaItems.length > 0;
  const hasContent = messageText.trim().length > 0;
  const isOverTelegramLimit = messageLength > messageCharacterLimit;
  const hasPublishableContent = hasContent || hasMedia;
  const canPublish = hasPublishableContent && !isOverTelegramLimit;
  const selectedChannel = useMemo(() => channels.find((channel) => channel.chatId === selectedChannelId), [channels, selectedChannelId]);

  useEffect(() => {
    if (!open) return;

    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;
    const originalOverscrollBehavior = document.documentElement.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.documentElement.style.overscrollBehavior = 'none';

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.touchAction = originalTouchAction;
      document.documentElement.style.overscrollBehavior = originalOverscrollBehavior;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const savedChannels = loadSavedTelegramChannels();
    setChannels(savedChannels);
    setStatus(null);
    setPostUrl('');
    setIsVerifying(false);
    setIsPublishing(false);
    setInputChannel('');

    if (savedChannels.length > 0) {
      setStep('select');
      setSelectedChannelId(savedChannels[0].chatId);
    } else {
      setStep('add');
      setSelectedChannelId('');
    }
  }, [open]);

  useEffect(() => {
    if (!status || status.severity !== 'success') return;
    const timer = window.setTimeout(() => {
      setStatus((previous) => (previous?.severity === 'success' ? null : previous));
    }, STATUS_AUTO_HIDE_MS * 5);
    return () => window.clearTimeout(timer);
  }, [status]);

  if (!open) return null;

  const setError = (message: string) => setStatus({ message, severity: 'error' });
  const setSuccess = (message: string) => setStatus({ message, severity: 'success' });
  const setInfo = (message: string) => setStatus({ message, severity: 'info' });
  const setWarning = (message: string) => setStatus({ message, severity: 'warning' });

  const syncSavedChannels = () => {
    const nextChannels = loadSavedTelegramChannels();
    setChannels(nextChannels);

    if (!nextChannels.length) {
      setSelectedChannelId('');
      setStep('add');
      return nextChannels;
    }

    if (!nextChannels.some((channel) => channel.chatId === selectedChannelId)) {
      setSelectedChannelId(nextChannels[0].chatId);
    }

    return nextChannels;
  };

  const handleAddChannel = async () => {
    const nextInput = inputChannel.trim();
    if (!nextInput) {
      setError('Введите ссылку, @username или идентификатор канала.');
      return;
    }

    setIsVerifying(true);
    setStatus({ message: 'Проверяем доступ бота к каналу…', severity: 'info' });
    setPostUrl('');

    try {
      const response = await verifyTelegramChannel({ channel: nextInput });
      if (!response.botIsAdmin) {
        setError('Бот не является администратором этого канала. Добавьте бота в канал как админ и повторите проверку.');
        return;
      }

      const nextChannel: TelegramChannelRecord = {
        ...response,
        verifiedAt: new Date().toISOString(),
      };

      saveTelegramChannel(nextChannel);
      syncSavedChannels();
      setSelectedChannelId(nextChannel.chatId);
      setStep('select');
      setInputChannel('');
      setSuccess(`Канал ${nextChannel.title} подтвержден. Нажми «Отправить», чтобы опубликовать.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Не удалось проверить канал.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handlePublish = async () => {
    if (!selectedChannel) {
      setError('Выбери канал для публикации.');
      return;
    }

    if (!selectedChannel.botIsAdmin) {
      setError('Этот канал сохранен без статуса администратора. Проверь, что бот еще в канале админом.');
      return;
    }

    if (!canPublish) {
      if (!hasPublishableContent) {
        setError('Нужен текст или хотя бы одно изображение.');
        return;
      }

      setWarning(`Текст превышает лимит Telegram в ${messageCharacterLimit} символов. Слишком длинная часть будет обрезана.`);
      return;
    }

    setIsPublishing(true);
    setStatus({ message: 'Публикуем сообщение…', severity: 'info' });
    setPostUrl('');

    try {
      const preparedMedia = await Promise.all(mediaItems
        .slice(0, TELEGRAM_MAX_MEDIA_ITEMS)
        .map((item, index) => loadAssetBlob(item.asset)
          .then((blob) => {
            if (!blob) return null;
            return new File([blob], item.asset.name || `telegram-media-${index}.png`, {
              type: item.asset.mimeType || 'image/png',
            });
          })),
      );
      const media = preparedMedia.filter((item): item is File => item !== null);
      const contentHtml = toTelegramHtmlFromEditor({ messageText, messageRichText });

      const response = await sendTelegramPost({
        channel: selectedChannel.chatId,
        contentHtml,
        media,
      });

      if (response.postUrl) setPostUrl(response.postUrl);
      setSuccess(`Опубликовано успешно. Сообщений: ${response.messageIds.length}. ${response.postUrl ? 'Нажмите «Открыть пост».' : ''}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Не удалось опубликовать сообщение.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDeleteChannel = (chatId: string) => {
    removeTelegramChannel(chatId);
    const nextChannels = syncSavedChannels();

    if (!nextChannels.length) {
      setStatus(null);
      return;
    }

    if (!nextChannels.some((channel) => channel.chatId === selectedChannelId)) {
      setSelectedChannelId(nextChannels[0].chatId);
    }
  };

  const isSelectStep = step === 'select';

  return createPortal(
    <div className="telegram-publication-modal-backdrop" onClick={onClose} role="presentation">
      <section className="telegram-publication-modal-panel" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <header className="telegram-publication-modal-header">
          <h3 className="telegram-publication-modal-title">Publish to Telegram</h3>
          <button type="button" className="telegram-publication-modal-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        {isSelectStep ? (
          <div className="telegram-publication-modal-body">
            <p className="telegram-publication-modal-description">
              Выбери подключенный канал или добавь новый, если бот еще не добавлен.
            </p>

            {channels.length > 0 ? (
              <div className="telegram-publication-channel-list" role="listbox" aria-label="Список каналов">
                {channels.map((channel) => {
                  const isSelected = channel.chatId === selectedChannelId;
                  const subtitle = [channel.username ? `@${channel.username}` : channel.chatId, channel.membersCount ? `${channel.membersCount} уч.` : '']
                    .filter(Boolean)
                    .join(' · ');

                  return (
                    <button
                      key={channel.chatId}
                      type="button"
                      className={isSelected ? 'telegram-publication-channel-item telegram-publication-channel-item-active' : 'telegram-publication-channel-item'}
                      onClick={() => {
                        setSelectedChannelId(channel.chatId);
                        setStatus(null);
                      }}
                      role="option"
                      aria-selected={isSelected}
                    >
                      <div className="telegram-publication-channel-item-main">
                        <span className="telegram-publication-channel-item-title">{channel.title}</span>
                        <span className="telegram-publication-channel-item-subtitle">{subtitle}</span>
                        {!channel.botIsAdmin ? <span className="telegram-publication-channel-item-warning">Нет прав администратора</span> : null}
                      </div>
                      {isSelected ? <CheckCircle2 size={16} /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}

            <button
              type="button"
              className="telegram-publication-secondary-button"
              onClick={() => {
                setStep('add');
                setInfo('Убедитесь, что бот добавлен в канал администратором.');
              }}
            >
              <Plus size={16} />
              Добавить канал
            </button>
          </div>
        ) : (
          <div className="telegram-publication-modal-body">
            <p className="telegram-publication-modal-description">
              Добавь бота в канал/группу как админа, после чего добавь канал здесь.
            </p>
            <p className="telegram-publication-modal-description">Формат: @channel, t.me/channel или ссылка на канал.</p>
            <label className="telegram-publication-form-row" htmlFor="telegram-channel-input">
              Идентификатор канала
              <input
                id="telegram-channel-input"
                className="telegram-publication-channel-input"
                value={inputChannel}
                onChange={(event) => setInputChannel(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !isVerifying && inputChannel.trim()) {
                    handleAddChannel();
                    event.preventDefault();
                  }
                }}
                placeholder="@my-channel"
                autoComplete="off"
              />
            </label>
            <button
              type="button"
              className="telegram-publication-primary-button"
              onClick={handleAddChannel}
              disabled={isVerifying || !inputChannel.trim()}
            >
              {isVerifying ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
              {isVerifying ? 'Проверяем…' : 'Проверить и добавить'}
            </button>
            <button
              type="button"
              className="telegram-publication-secondary-button"
              onClick={() => {
                setStep('select');
                setStatus(null);
              }}
              disabled={isVerifying}
            >
              Назад
            </button>
          </div>
        )}

        <footer className="telegram-publication-modal-footer">
          {status ? (
            <p className={`telegram-publication-modal-status telegram-publication-modal-status-${status.severity}`}>
              {status.message}
            </p>
          ) : null}

          {postUrl ? (
            <a
              className="telegram-publication-modal-link"
              href={postUrl}
              rel="noopener noreferrer"
              target="_blank"
              onClick={(event) => event.stopPropagation()}
            >
              <ExternalLink size={14} />
              Открыть пост
            </a>
          ) : null}

          {isSelectStep ? (
            <div className="telegram-publication-modal-actions">
              {selectedChannel ? (
                <button
                  type="button"
                  className="telegram-publication-primary-button"
                  disabled={isPublishing || !selectedChannel.botIsAdmin || !canPublish}
                  onClick={handlePublish}
                >
                  {isPublishing ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
                  {isPublishing ? 'Публикуем…' : 'Отправить'}
                </button>
              ) : null}
              {selectedChannel ? (
                <button
                  type="button"
                  className="telegram-publication-secondary-button"
                  onClick={() => handleDeleteChannel(selectedChannel.chatId)}
                  disabled={isPublishing || isVerifying}
                >
                  Удалить канал
                </button>
              ) : null}
            </div>
          ) : null}

          {!isSelectStep ? (
            <button
              type="button"
              className="telegram-publication-secondary-button"
              onClick={() => {
                setStep('select');
                if (channels.length === 0) {
                  setInfo('Сначала добавь канал и проверь его.');
                }
              }}
              disabled={isVerifying}
            >
              К списку каналов
            </button>
          ) : null}
        </footer>
      </section>
    </div>,
    document.body,
  );
}
