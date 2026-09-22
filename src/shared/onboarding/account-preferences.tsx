'use client';
import { useEffect, useRef } from 'react';
import { useTheme } from '@prodactionpro/ui-core/theme';
import { useSession } from '@/shared/auth/client';
import { useInterfaceLocale } from '@/shared/i18n/interface-locale';

/** Hydrate this product's saved preferences only after the questionnaire was used. */
export function OnboardingAccountPreferences() {
  const { data: session } = useSession();
  const { setTheme } = useTheme();
  const { setLocale } = useInterfaceLocale();
  const userId = session?.user.id;
  const hydrated = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || hydrated.current === userId) return;
    const abort = new AbortController();
    void fetch('/api/account/onboarding', { signal: abort.signal, cache: 'no-store', headers: { 'x-account-id': userId } })
      .then(async (response) => {
        if (!response.ok) return;
        const value = await response.json();
        if (abort.signal.aborted || value.userId !== userId || value.revision < 1) return;
        hydrated.current = userId;
        // Import a questionnaire revision once per browser; later quick settings win.
        const preferenceKey = `reverie:onboarding-preferences:v1:${userId}`;
        try {
          if (Number(localStorage.getItem(preferenceKey)) >= value.revision) return;
          localStorage.setItem(preferenceKey, String(value.revision));
        } catch { /* Preferences still work without browser persistence. */ }
        if (value.locale === 'ru' || value.locale === 'en') setLocale(value.locale);
        if (['light', 'dark', 'system'].includes(value.theme)) setTheme(value.theme);
      }).catch(() => { /* Preferences never block the workspace. */ });
    return () => abort.abort();
  }, [userId, setLocale, setTheme]);
  return null;
}
