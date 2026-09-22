'use client';

import { useCallback, type ReactNode } from 'react';
import { ChatLocalizationProvider } from '@prodactionpro/chat-ui';
import { MediaLocalizationProvider } from '@prodactionpro/ui-media/client';
import { StoriesLocalizationProvider } from '@prodactionpro/ui-stories-editor/client';
import { useFormatLocale } from './use-format-locale';
import { useInterfaceLocale } from './interface-locale';
import { translatePackageMessage } from './package-translations';
import type { MessageParams } from './translate';

/** Shared packages receive UI copy only; their document data remains unchanged. */
export function PackageLocalization({ children }: { children: ReactNode }) {
  const { locale: interfaceLocale } = useInterfaceLocale();
  const translate = useCallback((source: string, params?: MessageParams) =>
    translatePackageMessage(interfaceLocale, source, params), [interfaceLocale]);
  const locale = useFormatLocale();
  return <MediaLocalizationProvider translate={translate} locale={locale}>
    <StoriesLocalizationProvider translate={translate} locale={locale}>
      <ChatLocalizationProvider translate={translate} locale={locale}>{children}</ChatLocalizationProvider>
    </StoriesLocalizationProvider>
  </MediaLocalizationProvider>;
}
