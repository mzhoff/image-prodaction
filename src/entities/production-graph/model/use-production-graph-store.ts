'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createGraphConnectionActions } from './graph-connection-actions';
import { createGraphHistoryActions } from './graph-history-actions';
import { createGraphLocationActions } from './graph-location-actions';
import { createGraphNodeActions } from './graph-node-actions';
import { createGraphPersistStorage, createPersistedGraphState, GRAPH_PERSIST_STORAGE_KEY } from './graph-persistence';
import { createGraphPortabilityActions } from './graph-portability-actions';
import { createGraphSectionActions } from './graph-section-actions';
import { createGraphSelectionActions } from './graph-selection-actions';
import { createGraphSubjectActions } from './graph-subject-actions';
import { createGraphUiStateActions } from './graph-ui-state-actions';
import { initialProject } from './initial-project';
import { normalizeProject } from './normalize-project';
import { createEmptyProjectUiState, normalizeProjectUiState } from './project-schema';
import type { GraphProject } from './types';
import type { ProductionGraphState } from './store-types';

export { MAX_GENERATE_IMAGE_REFERENCES } from './connection-rules';

export const useProductionGraphStore = create<ProductionGraphState>()(
  persist(
    (set, get) => ({
      ...initialProject,
      historyPast: [],
      historyFuture: [],
      uiState: createEmptyProjectUiState(),
      ...createGraphNodeActions(set),
      ...createGraphSectionActions(set, get),
      ...createGraphSubjectActions(set, get),
      ...createGraphLocationActions(set, get),
      ...createGraphConnectionActions(set, get),
      ...createGraphSelectionActions(set, get),
      ...createGraphHistoryActions(set, get),
      ...createGraphUiStateActions(set),
      ...createGraphPortabilityActions(set, get),
    }),
    {
      name: GRAPH_PERSIST_STORAGE_KEY,
      storage: createJSONStorage(createGraphPersistStorage),
      partialize: createPersistedGraphState,
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<ProductionGraphState & GraphProject>;
        const project = normalizeProject({ ...initialProject, ...persistedState });
        return {
          ...current,
          ...project,
          uiState: normalizeProjectUiState(persistedState.uiState, project),
          historyPast: [],
          historyFuture: [],
        };
      },
    },
  ),
);
