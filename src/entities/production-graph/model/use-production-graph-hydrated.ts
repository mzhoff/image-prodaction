'use client';

import { useEffect, useState } from 'react';
import { useProductionGraphStore } from './use-production-graph-store';

export function useProductionGraphHydrated() {
  const [hydrated, setHydrated] = useState(() => useProductionGraphStore.persist.hasHydrated());

  useEffect(() => {
    const syncHydration = () => setHydrated(useProductionGraphStore.persist.hasHydrated());
    syncHydration();
    queueMicrotask(syncHydration);

    const unsubscribeHydrate = useProductionGraphStore.persist.onHydrate(() => setHydrated(false));
    const unsubscribeFinishHydration = useProductionGraphStore.persist.onFinishHydration(() => setHydrated(true));

    return () => {
      unsubscribeHydrate();
      unsubscribeFinishHydration();
    };
  }, []);

  return hydrated;
}
