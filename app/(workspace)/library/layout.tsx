import type { ReactNode } from 'react';
import { LibraryProvider } from '@/pages/library';

export default function LibraryLayout({
  children,
  preview,
}: {
  children: ReactNode;
  preview: ReactNode;
}) {
  return (
    <LibraryProvider>
      {children}
      {preview}
    </LibraryProvider>
  );
}
