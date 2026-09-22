import type { InterfaceLocale } from './translate';

/** An explicit choice wins; otherwise use only the browser's primary language. */
export function resolveInitialInterfaceLocale(
  storedLocale: string | null | undefined,
  acceptLanguage: string | null | undefined,
): InterfaceLocale {
  if (storedLocale === 'ru' || storedLocale === 'en') return storedLocale;
  const primaryLanguage = acceptLanguage?.split(',', 1)[0]?.split(';', 1)[0]?.trim().toLowerCase();
  return primaryLanguage === 'ru' || primaryLanguage?.startsWith('ru-') ? 'ru' : 'en';
}
