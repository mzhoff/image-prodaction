'use client';

import { useCallback, useSyncExternalStore } from 'react';

type Collection = 'projects' | 'chats';
const PREFIX = 'reverie:sidebar-collection:v1:';
const UPDATED = 'reverie:sidebar-collection-updated';
const session = new Map<Collection, boolean>();
const serverSnapshot = () => true;

function read(collection: Collection) {
  const current = session.get(collection);
  if (current !== undefined) return current;
  try {
    const stored = window.localStorage.getItem(`${PREFIX}${collection}`);
    if (stored === 'true' || stored === 'false') return stored === 'true';
  } catch { /* Keep the current session usable when browser storage is blocked. */ }
  return session.get(collection) ?? true;
}

function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(PREFIX)) {
      session.clear();
      notify();
    }
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(UPDATED, notify);
  return () => { window.removeEventListener('storage', onStorage); window.removeEventListener(UPDATED, notify); };
}

/** Browser preference only: no project or chat contents are persisted. */
export function useSidebarCollectionExpanded(collection: Collection) {
  const snapshot = useCallback(() => read(collection), [collection]);
  const expanded = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const setExpanded = useCallback((next: boolean) => {
    session.set(collection, next);
    try { window.localStorage.setItem(`${PREFIX}${collection}`, String(next)); } catch { /* In-memory fallback. */ }
    window.dispatchEvent(new Event(UPDATED));
  }, [collection]);
  return [expanded, setExpanded] as const;
}
