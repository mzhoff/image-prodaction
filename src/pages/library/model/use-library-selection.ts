'use client';

import { useCallback, useMemo, useState } from 'react';
import type { LibraryAssetItem } from './types';

export function useLibrarySelection(items: LibraryAssetItem[], scope: string) {
  const [state, setState] = useState({ scope, active: false, ids: [] as string[] });
  // Forget old selection, rather than letting it reappear when returning to a filter/workspace.
  if (state.scope !== scope) setState({ scope, active: false, ids: [] });
  const active = state.scope === scope && state.active;
  const selected = useMemo(() => {
    const ids = new Set(active ? state.ids : []);
    return items.filter((item) => ids.has(item.id));
  }, [active, items, state.ids]);
  const selectedIds = useMemo(() => new Set(selected.map((item) => item.id)), [selected]);
  const start = useCallback((item: LibraryAssetItem) => setState({ scope, active: true, ids: [item.id] }), [scope]);
  const clear = useCallback(() => setState({ scope, active: false, ids: [] }), [scope]);
  const toggle = useCallback((item: LibraryAssetItem) => setState((previous) => {
    const ids = previous.scope === scope ? previous.ids : [];
    return { scope, active: true, ids: ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id] };
  }), [scope]);
  const selectAll = useCallback(() => setState({ scope, active: true, ids: items.map((item) => item.id) }), [items, scope]);
  const remove = useCallback((ids: string[]) => setState((previous) => ({ ...previous, ids: previous.ids.filter((id) => !ids.includes(id)) })), []);
  return { active, selected, selectedIds, start, clear, toggle, selectAll, remove };
}
