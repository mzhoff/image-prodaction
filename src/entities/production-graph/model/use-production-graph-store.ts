'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createGraphConnectionActions } from './graph-connection-actions';
import { createGraphHistoryActions } from './graph-history-actions';
import { createGraphNodeActions } from './graph-node-actions';
import { createGraphSectionActions } from './graph-section-actions';
import { createGraphSelectionActions } from './graph-selection-actions';
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
      ...createGraphSectionActions(set),
      ...createGraphConnectionActions(set, get),
      ...createGraphSelectionActions(set, get),
      ...createGraphHistoryActions(set, get),
      ...createGraphUiStateActions(set),
    }),
    {
      name: 'reverie-image-production-project:v1',
      partialize: (state) => ({
        version: state.version,
        nodes: state.nodes,
        sections: state.sections,
        edges: state.edges,
        assets: state.assets,
        presets: state.presets,
        runs: state.runs,
        selectedNodeIds: state.selectedNodeIds,
        selectedSectionIds: state.selectedSectionIds,
        uiState: state.uiState,
      }),
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
