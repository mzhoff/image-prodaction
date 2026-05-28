'use client';

import { useEffect, useState } from 'react';
import { createFallbackCatalog } from './openrouter-models';
import type { OpenRouterModelCatalog } from './openrouter-models';

const fallbackCatalog = createFallbackCatalog();
let cachedCatalog: OpenRouterModelCatalog | null = null;
let catalogPromise: Promise<OpenRouterModelCatalog> | null = null;

export function useOpenRouterModels() {
  const [catalog, setCatalog] = useState<OpenRouterModelCatalog>(cachedCatalog ?? fallbackCatalog);
  const [loading, setLoading] = useState(!cachedCatalog);

  useEffect(() => {
    let cancelled = false;

    if (cachedCatalog) {
      setCatalog(cachedCatalog);
      setLoading(false);
      return undefined;
    }

    catalogPromise ??= loadCatalog();
    void catalogPromise.then((nextCatalog) => {
      if (cancelled) return;
      setCatalog(nextCatalog);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { ...catalog, loading };
}

async function loadCatalog() {
  try {
    const response = await fetch('/api/ai/models', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Models API failed: ${response.status}`);
    cachedCatalog = await response.json() as OpenRouterModelCatalog;
  } catch {
    cachedCatalog = fallbackCatalog;
  }

  return cachedCatalog;
}
