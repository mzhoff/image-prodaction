'use client';

import Link from 'next/link';
import { Film, Image as ImageIcon, MessageSquare, Route, Video, PanelsTopLeft } from '@prodactionpro/ui-core/icons';
import { useProductionChats } from '@/features/chat-assistant/model/use-production-chats';
import { useInterfaceLocale } from '@/shared/i18n/interface-locale';
import { ProductionChatActions } from './production-chat-actions';

export const PRODUCTION_CHAT_DRAG_TYPE = 'application/x-reverie-chat';
const icons = { text: MessageSquare, image: ImageIcon, video: Video, flow: Route, storyboard: PanelsTopLeft, timeline: Film };

export function SidebarChatList({ workspaceId, folderId, status = 'active' }: { workspaceId?: string; folderId?: string; status?: string }) {
  const { text } = useInterfaceLocale();
  const chats = useProductionChats(workspaceId, status, folderId, '', true);
  return <>
    <ul className="production-sidebar-chat-list" aria-busy={chats.loading} aria-label={folderId ? text('Чаты проекта', 'Project chats') : status === 'archived' ? text('Архив чатов', 'Archived chats') : status === 'deleted' ? text('Корзина чатов', 'Deleted chats') : text('Недавние чаты', 'Recent chats')}>
      {chats.items.map((chat) => {
        const Icon = icons[chat.workflowKind ?? (chat.kind === 'flow' ? 'flow' : chat.kind === 'storyboard' ? 'storyboard' : 'text')];
        return <li key={chat.id} draggable={chat.status === 'active'} onDragStart={(event) => {
          event.dataTransfer.setData(PRODUCTION_CHAT_DRAG_TYPE, JSON.stringify({ id: chat.id, workspaceId })); event.dataTransfer.effectAllowed = 'move';
        }}><Link href={chat.href} title={chat.title}><Icon size={15} /><span>{chat.title}</span></Link>
          {workspaceId ? <ProductionChatActions chat={chat} workspaceId={workspaceId} /> : null}</li>;
      })}
    </ul>
    {chats.error ? <button type="button" className="production-navigation-error" onClick={chats.refresh}>{text('Обновить чаты', 'Refresh chats')}</button>
      : !chats.items.length ? <p className="production-navigation-error">{chats.loading ? text('Загружаем…', 'Loading…') : folderId ? text('Перетащите сюда чат', 'Drop a chat here') : text('Пока нет разговоров', 'No conversations yet')}</p> : null}
    {chats.hasMore ? <button className="production-chats-all" type="button" disabled={chats.loading} onClick={chats.loadMore}>{chats.loading ? text('Загружаем…', 'Loading…') : text('Показать ещё', 'Show more')}</button> : null}
  </>;
}
