'use client';

import { syncGeneratePromptSections } from './sync-generate-prompt-sections';
import type { StoreSet } from './store-action-types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createGraphConnectionActions } from './graph-connection-actions';
import { createGraphFavoriteNodeActions } from './graph-favorite-node-actions';
import { createGraphHistoryActions } from './graph-history-actions';
import { createGraphLocationActions } from './graph-location-actions';
import { createGraphNodeActions } from './graph-node-actions';
import { createGraphTextFragmentActions } from './graph-text-fragment-actions';
import { createGraphPipelineContractActions } from './graph-pipeline-contract-actions';
import { GRAPH_PERSIST_STORAGE_KEY } from './graph-persistence';
import { createGraphStateStorage, selectPersistedGraphState } from './graph-state-storage';
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
    (rawSet, get) => {
      const set: StoreSet = (partial) => rawSet((state) => {
        const patch = typeof partial === 'function' ? partial(state) : partial;
        const graphChanged = patch.edges && patch.edges !== state.edges;
        const dataChanged = patch.nodes && (patch.nodes.length !== state.nodes.length
          || patch.nodes.some((node, index) => node.id !== state.nodes[index]?.id || node.data !== state.nodes[index]?.data));
        if (!graphChanged && !dataChanged) return patch;
        return { ...patch, ...syncGeneratePromptSections(patch.nodes ?? state.nodes, patch.edges ?? state.edges) };
      });
      return ({
      ...initialProject,
      historyPast: [],
      historyFuture: [],
      uiState: createEmptyProjectUiState(),
      ...createGraphNodeActions(set),
      ...createGraphTextFragmentActions(set),
      ...createGraphPipelineContractActions(set),
      ...createGraphFavoriteNodeActions(set),
      ...createGraphSectionActions(set, get),
      ...createGraphSubjectActions(set, get),
      ...createGraphLocationActions(set, get),
      ...createGraphConnectionActions(set, get),
      ...createGraphSelectionActions(set, get),
      ...createGraphHistoryActions(set, get),
      ...createGraphUiStateActions(set),
      ...createGraphPortabilityActions(set, get),
      });
    },
    {
      name: GRAPH_PERSIST_STORAGE_KEY,
      storage: createGraphStateStorage(),
      partialize: selectPersistedGraphState,
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
