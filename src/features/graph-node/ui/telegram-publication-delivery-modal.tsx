'use client';

import { CheckCircle2, ExternalLink, Loader2, Plus, Send, X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { TelegramPreviewMediaItem } from '../model/use-telegram-publication-node-model';
import { useTelegramPublicationDelivery } from './use-telegram-publication-delivery';

interface Props {
  mediaItems: TelegramPreviewMediaItem[];
  messageCharacterLimit: number;
  messageLength: number;
  messageRichText?: string;
  messageText: string;
  onClose: () => void;
  open: boolean;
}

export function TelegramPublicationDeliveryModal(props: Props) {
  const delivery = useTelegramPublicationDelivery(props);
  useEffect(() => {
    if (!props.open) return;
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
  }, [props.open]);
  if (!props.open) return null;

  return createPortal(
    <div className="telegram-publication-modal-backdrop" onClick={props.onClose} role="presentation">
      <section className="telegram-publication-modal-panel" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <header className="telegram-publication-modal-header">
          <h3 className="telegram-publication-modal-title">Publish to Telegram</h3>
          <button type="button" className="telegram-publication-modal-close" onClick={props.onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        {delivery.isSelectStep ? <ChannelSelectStep delivery={delivery} /> : <ChannelAddStep delivery={delivery} />}
        <DeliveryFooter delivery={delivery} />
      </section>
    </div>,
    document.body,
  );
}

type DeliveryModel = ReturnType<typeof useTelegramPublicationDelivery>;

function ChannelSelectStep({ delivery }: { delivery: DeliveryModel }) {
  return (
    <div className="telegram-publication-modal-body">
      <p className="telegram-publication-modal-description">
        Выбери подключенный канал или добавь новый, если бот еще не добавлен.
      </p>
      {delivery.channels.length > 0 ? <div className="telegram-publication-channel-list" role="listbox" aria-label="Список каналов">
        {delivery.channels.map((channel) => {
          const isSelected = channel.chatId === delivery.selectedChannelId;
          const subtitle = [channel.username ? `@${channel.username}` : channel.chatId,
            channel.membersCount ? `${channel.membersCount} уч.` : ''].filter(Boolean).join(' · ');
          return <button
            key={channel.chatId}
            type="button"
            className={isSelected ? 'telegram-publication-channel-item telegram-publication-channel-item-active' : 'telegram-publication-channel-item'}
            onClick={() => {
              delivery.setSelectedChannelId(channel.chatId);
              delivery.setStatus(null);
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
          </button>;
        })}
      </div> : null}
      <button type="button" className="telegram-publication-secondary-button" onClick={() => {
        delivery.setStep('add');
        delivery.setInfo('Убедитесь, что бот добавлен в канал администратором.');
      }}>
        <Plus size={16} /> Добавить канал
      </button>
    </div>
  );
}

function ChannelAddStep({ delivery }: { delivery: DeliveryModel }) {
  return (
    <div className="telegram-publication-modal-body">
      <p className="telegram-publication-modal-description">Добавь бота в канал/группу как админа, после чего добавь канал здесь.</p>
      <p className="telegram-publication-modal-description">Формат: @channel, t.me/channel или ссылка на канал.</p>
      <label className="telegram-publication-form-row" htmlFor="telegram-channel-input">
        Идентификатор канала
        <input
          id="telegram-channel-input"
          className="telegram-publication-channel-input"
          value={delivery.inputChannel}
          onChange={(event) => delivery.setInputChannel(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !delivery.isVerifying && delivery.inputChannel.trim()) {
              void delivery.handleAddChannel();
              event.preventDefault();
            }
          }}
          placeholder="@my-channel"
          autoComplete="off"
        />
      </label>
      <button type="button" className="telegram-publication-primary-button" onClick={delivery.handleAddChannel} disabled={delivery.isVerifying || !delivery.inputChannel.trim()}>
        {delivery.isVerifying ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
        {delivery.isVerifying ? 'Проверяем…' : 'Проверить и добавить'}
      </button>
      <button type="button" className="telegram-publication-secondary-button" onClick={() => {
        delivery.setStep('select');
        delivery.setStatus(null);
      }} disabled={delivery.isVerifying}>Назад</button>
    </div>
  );
}

function DeliveryFooter({ delivery }: { delivery: DeliveryModel }) {
  return (
    <footer className="telegram-publication-modal-footer">
      {delivery.status ? <p className={`telegram-publication-modal-status telegram-publication-modal-status-${delivery.status.severity}`}>
        {delivery.status.message}
      </p> : null}
      {delivery.postUrl ? <a className="telegram-publication-modal-link" href={delivery.postUrl} rel="noopener noreferrer" target="_blank" onClick={(event) => event.stopPropagation()}>
        <ExternalLink size={14} /> Открыть пост
      </a> : null}
      {delivery.isSelectStep ? <div className="telegram-publication-modal-actions">
        {delivery.selectedChannel ? <button
          type="button"
          className="telegram-publication-primary-button"
          disabled={delivery.isPublishing || !delivery.selectedChannel.botIsAdmin || !delivery.canPublish}
          onClick={delivery.handlePublish}
        >
          {delivery.isPublishing ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
          {delivery.isPublishing ? 'Публикуем…' : 'Отправить'}
        </button> : null}
        {delivery.selectedChannel ? <button
          type="button"
          className="telegram-publication-secondary-button"
          onClick={() => delivery.handleDeleteChannel(delivery.selectedChannel!.chatId)}
          disabled={delivery.isPublishing || delivery.isVerifying}
        >Удалить канал</button> : null}
      </div> : <button type="button" className="telegram-publication-secondary-button" onClick={() => {
        delivery.setStep('select');
        if (delivery.channels.length === 0) delivery.setInfo('Сначала добавь канал и проверь его.');
      }} disabled={delivery.isVerifying}>К списку каналов</button>}
    </footer>
  );
}
