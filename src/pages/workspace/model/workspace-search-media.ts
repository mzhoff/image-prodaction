import { emptyLibraryFilters, readLibraryFilters, writeLibraryFilters } from '@/pages/library/model/library-filters';
import type { LibraryFilters } from '@/pages/library/model/types';

/** A new query replaces only the text; the Library's media constraints stay intact. */
export function workspaceSearchMediaFilters(query: string, filters?: Partial<LibraryFilters>): LibraryFilters {
  return readLibraryFilters(new URLSearchParams(writeLibraryFilters({ ...emptyLibraryFilters, ...filters, q: query })));
}
