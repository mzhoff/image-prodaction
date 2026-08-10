'use client';

import { useEffect, useMemo, useState } from 'react';
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

type DeliveryStep = 'select' | 'add';
type StatusSeverity = 'error' | 'info' | 'success' | 'warning';
interface DeliveryStatus { message: string; severity: StatusSeverity }

interface Params {
  mediaItems: TelegramPreviewMediaItem[];
  messageCharacterLimit: number;
  messageLength: number;
  messageRichText?: string;
  messageText: string;
  open: boolean;
}

export function useTelegramPublicationDelivery(params: Params) {
  const [channels, setChannels] = useState<TelegramChannelRecord[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [inputChannel, setInputChannel] = useState('');
  const [step, setStep] = useState<DeliveryStep>('select');
  const [status, setStatus] = useState<DeliveryStatus | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [postUrl, setPostUrl] = useState('');
  const hasPublishableContent = params.messageText.trim().length > 0 || params.mediaItems.length > 0;
  const canPublish = hasPublishableContent && params.messageLength <= params.messageCharacterLimit;
  const selectedChannel = useMemo(
    () => channels.find((channel) => channel.chatId === selectedChannelId),
    [channels, selectedChannelId],
  );

  useEffect(() => {
    if (!params.open) return;
    const savedChannels = loadSavedTelegramChannels();
    setChannels(savedChannels);
    setStatus(null);
    setPostUrl('');
    setIsVerifying(false);
    setIsPublishing(false);
    setInputChannel('');
    setStep(savedChannels.length > 0 ? 'select' : 'add');
    setSelectedChannelId(savedChannels[0]?.chatId ?? '');
  }, [params.open]);

  useEffect(() => {
    if (status?.severity !== 'success') return;
    const timer = window.setTimeout(() => {
      setStatus((previous) => previous?.severity === 'success' ? null : previous);
    }, 5_000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const setError = (message: string) => setStatus({ message, severity: 'error' });
  const setInfo = (message: string) => setStatus({ message, severity: 'info' });
  const syncSavedChannels = () => {
    const nextChannels = loadSavedTelegramChannels();
    setChannels(nextChannels);
    if (!nextChannels.length) {
      setSelectedChannelId('');
      setStep('add');
    } else if (!nextChannels.some((channel) => channel.chatId === selectedChannelId)) {
      setSelectedChannelId(nextChannels[0].chatId);
    }
    return nextChannels;
  };

  const handleAddChannel = async () => {
    const channel = inputChannel.trim();
    if (!channel) {
      setError('Введите ссылку, @username или идентификатор канала.');
      return;
    }
    setIsVerifying(true);
    setInfo('Проверяем доступ бота к каналу…');
    setPostUrl('');
    try {
      const response = await verifyTelegramChannel({ channel });
      if (!response.botIsAdmin) {
        setError('Бот не является администратором этого канала. Добавьте бота в канал как админ и повторите проверку.');
        return;
      }
      const nextChannel: TelegramChannelRecord = { ...response, verifiedAt: new Date().toISOString() };
      saveTelegramChannel(nextChannel);
      syncSavedChannels();
      setSelectedChannelId(nextChannel.chatId);
      setStep('select');
      setInputChannel('');
      setStatus({ message: `Канал ${nextChannel.title} подтвержден. Нажми «Отправить», чтобы опубликовать.`, severity: 'success' });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Не удалось проверить канал.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handlePublish = async () => {
    if (!selectedChannel) return setError('Выбери канал для публикации.');
    if (!selectedChannel.botIsAdmin) return setError('Этот канал сохранен без статуса администратора. Проверь, что бот еще в канале админом.');
    if (!canPublish) {
      setStatus({
        message: hasPublishableContent
          ? `Текст превышает лимит Telegram в ${params.messageCharacterLimit} символов. Слишком длинная часть будет обрезана.`
          : 'Нужен текст или хотя бы одно изображение.',
        severity: hasPublishableContent ? 'warning' : 'error',
      });
      return;
    }
    setIsPublishing(true);
    setInfo('Публикуем сообщение…');
    setPostUrl('');
    try {
      const preparedMedia = await Promise.all(params.mediaItems.slice(0, TELEGRAM_MAX_MEDIA_ITEMS)
        .map(async (item, index) => {
          const blob = await loadAssetBlob(item.asset);
          return blob ? new File([blob], item.asset.name || `telegram-media-${index}.png`, {
            type: item.asset.mimeType || 'image/png',
          }) : null;
        }));
      const response = await sendTelegramPost({
        channel: selectedChannel.chatId,
        contentHtml: toTelegramHtmlFromEditor({
          messageText: params.messageText,
          messageRichText: params.messageRichText,
        }),
        media: preparedMedia.filter((item): item is File => item !== null),
      });
      if (response.postUrl) setPostUrl(response.postUrl);
      setStatus({
        message: `Опубликовано успешно. Сообщений: ${response.messageIds.length}. ${response.postUrl ? 'Нажмите «Открыть пост».' : ''}`,
        severity: 'success',
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Не удалось опубликовать сообщение.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDeleteChannel = (chatId: string) => {
    removeTelegramChannel(chatId);
    const nextChannels = syncSavedChannels();
    if (!nextChannels.length) setStatus(null);
  };

  return {
    canPublish,
    channels,
    handleAddChannel,
    handleDeleteChannel,
    handlePublish,
    inputChannel,
    isPublishing,
    isSelectStep: step === 'select',
    isVerifying,
    postUrl,
    selectedChannel,
    selectedChannelId,
    setInfo,
    setInputChannel,
    setSelectedChannelId,
    setStatus,
    setStep,
    status,
  };
}
