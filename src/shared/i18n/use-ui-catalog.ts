'use client';
import { useMemo } from 'react';
import { localizeUiCatalog } from './localize-ui-catalog';
import type { useTranslations } from './use-translations';

export function useUiCatalog<T>(catalog: T, translate: ReturnType<typeof useTranslations>): T {
  return useMemo(() => localizeUiCatalog(catalog, translate), [catalog, translate]);
}
