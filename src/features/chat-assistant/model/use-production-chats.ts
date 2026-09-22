'use client';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { ProductionChatChange } from '@/modules/chat-assistant/contracts/production-chats';
import { CHATS_CHANGED, EMPTY_CHAT_SNAPSHOT } from './production-chats-cache';
import { useProductionChatsCache } from './production-chats-cache-context';

export { CHATS_CHANGED };
export function notifyChatsChanged(workspaceId?: string) { window.dispatchEvent(new CustomEvent(CHATS_CHANGED, { detail: workspaceId })); }
export function useProductionChats(workspaceId?: string, status = 'active', folderId?: string, query = '', paged = false) {
  const cache = useProductionChatsCache();
  const scope = useMemo(() => ({ workspaceId: workspaceId ?? '', status, folderId, query, paged }), [workspaceId, status, folderId, query, paged]);
  const subscribe = useCallback((listener: () => void) => workspaceId ? cache.subscribe(scope, listener) : () => {}, [cache, scope, workspaceId]);
  const read = useCallback(() => workspaceId ? cache.read(scope) : EMPTY_CHAT_SNAPSHOT, [cache, scope, workspaceId]);
  const snapshot = useSyncExternalStore(subscribe, read, () => EMPTY_CHAT_SNAPSHOT);
  useEffect(() => { if (workspaceId) void cache.load(scope); }, [cache, scope, workspaceId]);
  return { ...snapshot, loading: Boolean(workspaceId) && (snapshot.loading || (!snapshot.loaded && !snapshot.error)),
    refresh: () => { if (workspaceId) void cache.refresh(scope); },
    loadMore: () => { if (workspaceId) void cache.loadMore(scope); } };
}
export async function changeChat(workspaceId: string, id: string, change: ProductionChatChange) {
  const response = await fetch(`/api/production-chats/${encodeURIComponent(id)}`, { method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-workspace-id': workspaceId }, body: JSON.stringify(change) });
  if (!response.ok) throw new Error('Не удалось изменить чат. Проверьте доступ и повторите попытку.');
  notifyChatsChanged(workspaceId);
}
