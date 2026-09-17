import type { Metadata } from 'next';
import type { ReactNode } from 'react';
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

export const metadata: Metadata = {
  title: 'Reverie Image Production',
  description: 'Node-based image production pipeline prototype',
};

export default function RootLayout({
  children,
  settings,
}: Readonly<{
  children: ReactNode;
  settings: ReactNode;
}>) {
  return (
    <html lang="ru" className={onest.variable} data-pui-theme="reverie" data-theme="light" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: getThemeInitScript() }} /></head>
      <body>
        <ReverieThemeProvider>
          <div id="app-root">{children}</div>
          {settings}
        </ReverieThemeProvider>
      </body>
    </html>
  );
}
