'use client';

import { useCallback } from 'react';
import { useInterfaceLocale } from './interface-locale';
import { translateMessage, type MessageParams } from './translate';

/** Translate UI copy explicitly; never pass messages, prompts or document content. */
export function useTranslations() {
  const { locale } = useInterfaceLocale();
  return useCallback((source: string, params?: MessageParams) => translateMessage(locale, source, params), [locale]);
}
