'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { useSession } from '@/shared/auth/client';
import { ModelPreferenceStore } from './preference-store';
const stores = new Map<string, ModelPreferenceStore>();
function getStore(accountId: string) {
  let store = stores.get(accountId);
  if (!store) { store = new ModelPreferenceStore(accountId); stores.set(accountId, store); }
  return store;
}
export function useModelPreferences(enabled = true) {
  const { data: session } = useSession();
  const id = session?.user.id ?? '';
  const store = getStore(id);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    if (!enabled || !id) return;
    const refresh = () => { void store.refresh(); };
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [enabled, id, store]);
  return { ...state, change: store.change, reload: store.refresh };
}
