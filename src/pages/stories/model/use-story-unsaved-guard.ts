'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffectEvent, useEffect } from 'react';

export function useStoryUnsavedGuard(dirty: boolean) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const navigate = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download') || event.metaKey || event.ctrlKey) return;
      const url = new URL(anchor.href);
      if (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search) return;
      if (!window.confirm(tEffect("Есть несохранённые изменения. Покинуть историю?"))) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', unload); document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate, true); };
  }, [dirty]);
}
