'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { WorkspaceSearchScope } from '../model/workspace-search';
import type { LibraryFacets, LibraryFilters } from '@/pages/library/model/types';
import { useWorkspaceShell } from './workspace-shell-context';
import { WorkspaceSearchDialog } from './workspace-search-dialog';

// Keep the lightweight dialog ready: a cold lazy import would suspend the whole
// workspace layout on the first click. Search requests still start only on open.
type SearchOptions = { scope?: WorkspaceSearchScope; query?: string; mediaFilters?: LibraryFilters;
  mediaFacets?: LibraryFacets; onApplyMediaFilters?: (filters: LibraryFilters) => void };
const SearchContext = createContext<((options?: SearchOptions) => void) | null>(null);

export function WorkspaceSearchProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<SearchOptions | null>(null);
  const workspace = useWorkspaceShell();
  const openSearch = useCallback((next: SearchOptions = {}) => setOptions(next), []);
  return <SearchContext.Provider value={openSearch}>
    {children}
    {options ? <WorkspaceSearchDialog key={workspace.activeWorkspace?.id ?? 'loading'}
      initialScope={options.scope ?? 'all'} initialQuery={options.query ?? options.mediaFilters?.q ?? ''}
      initialMediaFilters={options.mediaFilters} initialMediaFacets={options.mediaFacets}
      onApplyMediaFilters={options.onApplyMediaFilters} onClose={() => setOptions(null)} /> : null}
  </SearchContext.Provider>;
}

export function useWorkspaceSearchDialog() {
  const openSearch = useContext(SearchContext);
  if (!openSearch) throw new Error('Workspace search requires WorkspaceSearchProvider.');
  return openSearch;
}
