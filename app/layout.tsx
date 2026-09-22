import '@reverie/identity-client/styles.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { cookies, headers } from 'next/headers';
import { AnalyticsRuntime } from '@/app/analytics/analytics-runtime';
import { ReverieThemeProvider } from '@prodactionpro/ui-core/theme';
import { getThemeInitScript } from '@prodactionpro/ui-core/theme-init';
import '@prodactionpro/ui-tokens/css/light.css';
import '@prodactionpro/ui-tokens/css/dark.css';
import '@prodactionpro/ui-tokens/css/reverie.css';
import '@prodactionpro/ui-core/styles.css';
import '@prodactionpro/chat-theme/tokens.css';
import '@prodactionpro/chat-ui/styles.css';
import './globals.css';
import { onest } from './fonts';
import { PackageLocalization } from '@/shared/i18n/package-localization';
import { InterfaceLocaleProvider } from '@/shared/i18n/interface-locale';
import { SubscriptionProvider } from '@/features/subscriptions/ui/subscription-provider';
import { readPublicBillingConfig } from '@/app/config/billing';
import { resolveInitialInterfaceLocale } from '@/shared/i18n/interface-locale-preference';

export const metadata: Metadata = {
  title: 'Reverie Image Production',
  description: 'Node-based image production pipeline prototype',
};

export default async function RootLayout({
  children,
  settings,
}: Readonly<{
  children: ReactNode;
  settings: ReactNode;
}>) {
  const [billing, cookieStore, requestHeaders] = await Promise.all([
    readPublicBillingConfig(), cookies(), headers(),
  ]);
  const locale = resolveInitialInterfaceLocale(
    cookieStore.get('production_locale')?.value,
    requestHeaders.get('accept-language'),
  );
  return (
    <html lang={locale} className={onest.variable} data-pui-theme="reverie" data-theme="light" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: getThemeInitScript() }} /></head>
      <body className="ym-hide-content">
        <ReverieThemeProvider>
          <InterfaceLocaleProvider initialLocale={locale}>
            <PackageLocalization><SubscriptionProvider config={billing}>
            <div id="app-root">{children}</div>
            {settings}
            <Suspense fallback={null}><AnalyticsRuntime /></Suspense>
            </SubscriptionProvider></PackageLocalization>
          </InterfaceLocaleProvider>
        </ReverieThemeProvider>
      </body>
    </html>
  );
}
