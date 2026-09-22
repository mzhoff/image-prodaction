'use client';

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useSession } from '@/shared/auth/client';
import { CHATS_CHANGED, createProductionChatsCache } from './production-chats-cache';

const Context = createContext<ReturnType<typeof createProductionChatsCache> | null>(null);
export function ProductionChatsCacheProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const userId = session?.user.id;
  const owner = useMemo(() => ({ userId, cache: createProductionChatsCache() }), [userId]);
  const cache = owner.cache;
  useEffect(() => {
    const invalidate = (event: Event) => cache.invalidate((event as CustomEvent<string | undefined>).detail);
    window.addEventListener(CHATS_CHANGED, invalidate);
    return () => window.removeEventListener(CHATS_CHANGED, invalidate);
  }, [cache]);
  return <Context.Provider value={cache}>{children}</Context.Provider>;
}
export function useProductionChatsCache() {
  const cache = useContext(Context);
  if (!cache) throw new Error('Chat lists must be rendered inside ProductionChatsCacheProvider.');
  return cache;
}
