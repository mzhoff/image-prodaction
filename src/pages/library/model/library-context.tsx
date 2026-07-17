'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useWorkspaceShell } from '@/pages/workspace/ui/workspace-shell-context';
import { readLibraryFilters, writeLibraryFilters } from './library-filters';
import type { LibraryFilters } from './types';
import { useLibraryAssets } from './use-library-assets';

type LibraryState = ReturnType<typeof useLibraryAssets> & {
  filters: LibraryFilters;
  filterQuery: string;
  setFilters: (patch: Partial<LibraryFilters>) => void;
};

const LibraryContext = createContext<LibraryState | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspace = useWorkspaceShell();
  const searchKey = searchParams?.toString() ?? '';
  const filters = useMemo(
    () => readLibraryFilters(new URLSearchParams(searchKey)),
    [searchKey],
  );
  const library = useLibraryAssets(workspace.activeWorkspace?.id, filters);
  const filterQuery = useMemo(() => writeLibraryFilters(filters), [filters]);

  const setFilters = useCallback((patch: Partial<LibraryFilters>) => {
    const next = { ...filters, ...patch };
    const query = writeLibraryFilters(next);
    const basePath = pathname?.startsWith('/library') ? '/library' : (pathname ?? '/library');
    router.replace(query ? `${basePath}?${query}` : basePath, { scroll: false });
  }, [filters, pathname, router]);

  const value = useMemo(() => ({
    ...library,
    filters,
    filterQuery,
    setFilters,
  }), [filterQuery, filters, library, setFilters]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) throw new Error('Library UI must be rendered inside LibraryProvider.');
  return context;
}
