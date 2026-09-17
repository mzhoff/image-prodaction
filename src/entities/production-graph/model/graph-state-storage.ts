import { createJSONStorage, type PersistStorage, type StateStorage } from 'zustand/middleware';
import { createGraphPersistStorage, createPersistedGraphState } from './graph-persistence';
import type { ProductionGraphState } from './store-types';

/** Select references only; expensive sanitizing/stringifying belongs after deduplication. */
export function selectPersistedGraphState(state: ProductionGraphState) {
  return {
    version: state.version, nodes: state.nodes, sections: state.sections, edges: state.edges,
    assets: state.assets, presets: state.presets, subjects: state.subjects, locations: state.locations,
    publications: state.publications, runs: state.runs, selectedNodeIds: state.selectedNodeIds,
    selectedSectionIds: state.selectedSectionIds, uiState: state.uiState,
  };
}
type PersistedState = ReturnType<typeof selectPersistedGraphState>;

export function createGraphStateStorage(getStorage: () => StateStorage = createGraphPersistStorage): PersistStorage<PersistedState> {
  const json = createJSONStorage<PersistedState>(getStorage)!;
  let previous: PersistedState | undefined;
  return {
    getItem: (name) => { previous = undefined; return json.getItem(name); },
    removeItem: (name) => { previous = undefined; return json.removeItem(name); },
    setItem: (name, value) => {
      const next = value.state;
      if (previous && (Object.keys(next) as (keyof PersistedState)[]).every((key) => next[key] === previous![key])) return;
      previous = next;
      // History and other transient-only updates never reach JSON.stringify or localStorage.
      return json.setItem(name, { ...value, state: createPersistedGraphState(next as ProductionGraphState) as PersistedState });
    },
  };
}
