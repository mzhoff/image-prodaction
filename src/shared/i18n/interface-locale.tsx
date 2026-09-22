'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSession } from '@/shared/auth/client';
import type { InterfaceLocale } from './translate';

export type { InterfaceLocale } from './translate';
const LocaleContext = createContext({ locale: 'ru' as InterfaceLocale, setLocale: (_locale: InterfaceLocale) => {},
  text: (ru: string, _en: string) => ru });

/** Personal browser preference, independent of the selected workspace. */
export function InterfaceLocaleProvider({ children, initialLocale = 'ru' }: { children: ReactNode; initialLocale?: InterfaceLocale }) {
  const { data: session } = useSession();
  const storageKey = `production:interface-locale:v1:${session?.user.id ?? 'guest'}`;
  const [preference, setPreference] = useState({ key: '', locale: 'ru' as InterfaceLocale });
  const locale = preference.key === storageKey ? preference.locale : initialLocale;
  useEffect(() => {
    const read = () => {
      let value: string = initialLocale;
      try { value = window.localStorage.getItem(storageKey) ?? initialLocale; } catch { /* Storage may be disabled. */ }
      setPreference({ key: storageKey, locale: value === 'en' ? 'en' : 'ru' });
    };
    read();
    const sync = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) read(); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [storageKey, initialLocale]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.cookie = `production_locale=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  }, [locale]);
  const value = useMemo(() => ({ locale, text: (ru: string, en: string) => locale === 'en' ? en : ru,
    setLocale: (next: InterfaceLocale) => {
      setPreference({ key: storageKey, locale: next });
      try { window.localStorage.setItem(storageKey, next); } catch { /* Keep the current session preference. */ }
    },
  }), [locale, storageKey]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export const useInterfaceLocale = () => useContext(LocaleContext);
