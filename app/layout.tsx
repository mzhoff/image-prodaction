import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

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
    <html lang="ru">
      <body>
        <div id="app-root">{children}</div>
        {settings}
      </body>
    </html>
  );
}
