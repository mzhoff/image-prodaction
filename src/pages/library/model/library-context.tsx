'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useWorkspaceShell } from '@/pages/workspace/ui/workspace-shell-context';
import { readLibraryFilters, writeLibraryFilters } from './library-filters';
import type { LibraryFilters } from './types';
import { useLibraryAssets } from './use-library-assets';
import { LibraryAssetActionsProvider } from '../ui/library-asset-actions';
import type { LibraryView } from '../lib/library-gallery';

type LibraryState = ReturnType<typeof useLibraryAssets> & {
  filters: LibraryFilters;
  filterQuery: string;
  navigationQuery: string;
  view: LibraryView;
  setView: (view: LibraryView) => void;
  setFilters: (patch: Partial<LibraryFilters>) => void;
};

const LibraryContext = createContext<LibraryState | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const workspace = useWorkspaceShell();
  const searchKey = searchParams?.toString() ?? '';
  const filters = useMemo(
    () => readLibraryFilters(new URLSearchParams(searchKey)),
    [searchKey],
  );
  const assetsSection = !searchParams?.get('section');
  const library = useLibraryAssets(assetsSection ? workspace.activeWorkspace?.id : undefined, filters);
  const filterQuery = useMemo(() => writeLibraryFilters(filters), [filters]);
  const view: LibraryView = searchParams?.get('view') === 'dates' ? 'dates' : 'gallery';
  const navigationQuery = withView(filterQuery, view);
  const setView = useCallback((next: LibraryView) => {
    const query = withView(filterQuery, next);
    // Presentation only: don't refetch assets or remount the Library route.
    window.history.replaceState(null, '', `${pathname ?? '/library'}${query ? `?${query}` : ''}`);
  }, [filterQuery, pathname]);

  const setFilters = useCallback((patch: Partial<LibraryFilters>) => {
    const next = { ...filters, ...patch };
    const query = withView(writeLibraryFilters(next), view);
    const basePath = pathname?.startsWith('/library') ? '/library' : (pathname ?? '/library');
    // Filters are consumed by the client API hook. A server route transition
    // is unnecessary and can restore the cached query after viewer navigation.
    window.history.replaceState(null, '', query ? `${basePath}?${query}` : basePath);
  }, [filters, pathname, view]);

  const value = useMemo(() => ({
    ...library,
    filters,
    filterQuery,
    navigationQuery,
    view,
    setView,
    setFilters,
  }), [filterQuery, navigationQuery, view, setView, filters, library, setFilters]);

  return <LibraryContext.Provider value={value}><LibraryAssetActionsProvider items={library.items}
    scope={`${workspace.activeWorkspace?.id ?? ''}:${filterQuery}`} onDeleted={library.removeItems}>{children}</LibraryAssetActionsProvider></LibraryContext.Provider>;
}

export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) throw new Error('Library UI must be rendered inside LibraryProvider.');
  return context;
}

function withView(query: string, view: LibraryView) {
  const params = new URLSearchParams(query);
  if (view === 'dates') params.set('view', 'dates');
  return params.toString();
}
