import type { ProductionChatSummary } from '@/modules/chat-assistant/contracts/production-chats';

export const CHATS_CHANGED = 'production-chats-changed';
export interface ChatListScope { workspaceId: string; status: string; folderId?: string; query: string; paged: boolean }
interface ChatPage { items: ProductionChatSummary[]; hasMore: boolean }
interface ChatSnapshot extends ChatPage { loaded: boolean; loading: boolean; error: string; offset: number }
interface Entry { scope: ChatListScope; snapshot: ChatSnapshot; stale: boolean; listeners: Set<() => void>; pending?: Promise<void>; controller?: AbortController }
type LoadPage = (scope: ChatListScope, offset: number, limit: number, signal: AbortSignal) => Promise<ChatPage>;
export const EMPTY_CHAT_SNAPSHOT: ChatSnapshot = { items: [], hasMore: false, loaded: false, loading: false, error: '', offset: 0 };

async function fetchPage(scope: ChatListScope, offset: number, limit: number, signal: AbortSignal): Promise<ChatPage> {
  const params = new URLSearchParams({ status: scope.status, limit: String(limit), offset: String(offset),
    ...(scope.folderId ? { folderId: scope.folderId } : {}), ...(scope.query ? { q: scope.query } : {}) });
  const response = await fetch(`/api/production-chats?${params}`, { headers: { 'x-workspace-id': scope.workspaceId }, signal, cache: 'no-store' });
  if (!response.ok) throw new Error('Не удалось загрузить чаты. Повторите попытку.');
  return response.json();
}

/** Owned by the authenticated UI provider, never persisted or shared between users. */
export function createProductionChatsCache(loadPage: LoadPage = fetchPage) {
  const entries = new Map<string, Entry>();
  function entryFor(scope: ChatListScope) {
    const key = JSON.stringify([scope.workspaceId, scope.status, scope.folderId ?? '', scope.query, scope.paged]);
    let entry = entries.get(key);
    if (!entry) { entry = { scope, snapshot: EMPTY_CHAT_SNAPSHOT, stale: false, listeners: new Set() }; entries.set(key, entry); }
    return entry;
  }
  const publish = (entry: Entry, patch: Partial<ChatSnapshot>) => {
    entry.snapshot = { ...entry.snapshot, ...patch }; entry.listeners.forEach((listener) => listener());
  };
  function request(scope: ChatListScope, mode: 'read' | 'more' | 'refresh' = 'read'): Promise<void> {
    const entry = entryFor(scope);
    if (entry.pending) return entry.pending;
    if (mode === 'read' && entry.snapshot.loaded && !entry.stale) return Promise.resolve();
    if (mode === 'more' && !entry.snapshot.hasMore) return Promise.resolve();
    const append = mode === 'more' && !entry.stale;
    const start = append ? entry.snapshot.offset : 0;
    const target = append ? 10 : Math.max(scope.paged ? 5 : 200, entry.snapshot.offset);
    const controller = new AbortController(); entry.controller = controller;
    publish(entry, { loading: true, error: '' });
    const pending = Promise.resolve().then(async () => {
      try {
        let offset = start, more = true;
        const items: ProductionChatSummary[] = append ? [...entry.snapshot.items] : [];
        do {
          const page = await loadPage(scope, offset, Math.min(200, target - (offset - start)), controller.signal);
          if (controller.signal.aborted) return;
          items.push(...page.items); offset += page.items.length; more = page.hasMore && page.items.length > 0;
        } while (more && offset - start < target);
        entry.stale = false;
        publish(entry, { items: [...new Map(items.map((item) => [item.id, item])).values()], offset, hasMore: more, loaded: true });
      } catch {
        if (!controller.signal.aborted) publish(entry, { error: 'Не удалось загрузить чаты. Повторите попытку.' });
      } finally {
        if (!controller.signal.aborted) { entry.pending = undefined; publish(entry, { loading: false }); }
      }
    });
    entry.pending = pending;
    return pending;
  }
  return {
    read: (scope: ChatListScope) => entryFor(scope).snapshot,
    subscribe(scope: ChatListScope, listener: () => void) {
      const entry = entryFor(scope); entry.listeners.add(listener);
      return () => { entry.listeners.delete(listener); };
    },
    load: (scope: ChatListScope) => request(scope),
    loadMore: (scope: ChatListScope) => request(scope, 'more'),
    refresh: (scope: ChatListScope) => request(scope, 'refresh'),
    invalidate(workspaceId?: string) {
      for (const entry of entries.values()) {
        if (workspaceId && entry.scope.workspaceId !== workspaceId) continue;
        entry.controller?.abort(); entry.pending = undefined; entry.stale = true;
        publish(entry, { loading: false });
        if (entry.listeners.size) void request(entry.scope);
      }
    },
  };
}
