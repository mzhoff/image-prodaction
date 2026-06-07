'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createGraphConnectionActions } from './graph-connection-actions';
import { createGraphHistoryActions } from './graph-history-actions';
import { createGraphLocationActions } from './graph-location-actions';
import { createGraphNodeActions } from './graph-node-actions';
import { createGraphPipelineActions } from './graph-pipeline-actions';
import { createGraphPersistStorage, createPersistedGraphState, GRAPH_PERSIST_STORAGE_KEY } from './graph-persistence';
import { createGraphPortabilityActions } from './graph-portability-actions';
import { createGraphSectionActions } from './graph-section-actions';
import { createGraphSelectionActions } from './graph-selection-actions';
import { createGraphSubjectActions } from './graph-subject-actions';
import { createGraphUiStateActions } from './graph-ui-state-actions';
import { initialProject } from './initial-project';
import { normalizeProject } from './normalize-project';
import { createEmptyProjectUiState, normalizeProjectUiState } from './project-schema';
import { createPipelineStatePatch, normalizePipelineState } from './graph-pipelines';
import type { GraphProject } from './types';
import type { ProductionGraphState } from './store-types';

export { MAX_GENERATE_IMAGE_REFERENCES } from './connection-rules';

export const useProductionGraphStore = create<ProductionGraphState>()(
  persist(
    (set, get) => ({
      ...initialProject,
      activePipelineId: '',
      historyPast: [],
      historyFuture: [],
      pipelines: [],
      uiState: createEmptyProjectUiState(),
      ...createGraphNodeActions(set),
      ...createGraphSectionActions(set, get),
      ...createGraphSubjectActions(set, get),
      ...createGraphLocationActions(set, get),
      ...createGraphConnectionActions(set, get),
      ...createGraphSelectionActions(set, get),
      ...createGraphHistoryActions(set, get),
      ...createGraphUiStateActions(set),
      ...createGraphPipelineActions(set, get),
      ...createGraphPortabilityActions(set, get),
    }),
    {
      name: GRAPH_PERSIST_STORAGE_KEY,
      storage: createJSONStorage(createGraphPersistStorage),
      partialize: createPersistedGraphState,
      merge: (persisted, current) => {
        if (!isRecord(persisted)) return current;

        const persistedState = persisted as Partial<ProductionGraphState & GraphProject>;
        const fallbackProject = normalizeProject({ ...initialProject, ...persistedState });
        const fallbackUiState = normalizeProjectUiState(persistedState.uiState, fallbackProject);
        const pipelineState = normalizePipelineState(
          persistedState.pipelines,
          persistedState.activePipelineId,
          fallbackProject,
          fallbackUiState,
        );
        if (!pipelineState.activePipeline) {
          return {
            ...current,
            ...fallbackProject,
            activePipelineId: '',
            historyPast: [],
            historyFuture: [],
            pipelines: [],
            uiState: fallbackUiState,
          };
        }

        return {
          ...current,
          pipelines: pipelineState.pipelines,
          ...createPipelineStatePatch(pipelineState.activePipeline),
        };
      },
    },
  ),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
