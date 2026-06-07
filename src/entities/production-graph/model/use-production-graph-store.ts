'use client';

import { create } from 'zustand';
import { createGraphConnectionActions } from './graph-connection-actions';
import { createGraphHistoryActions } from './graph-history-actions';
import { createGraphLocationActions } from './graph-location-actions';
import { createGraphNodeActions } from './graph-node-actions';
import { createGraphPipelineActions } from './graph-pipeline-actions';
import { createGraphPortabilityActions } from './graph-portability-actions';
import { createGraphSectionActions } from './graph-section-actions';
import { createGraphSelectionActions } from './graph-selection-actions';
import { createGraphSubjectActions } from './graph-subject-actions';
import { createGraphUiStateActions } from './graph-ui-state-actions';
import { initialProject } from './initial-project';
import { createEmptyProjectUiState } from './project-schema';
import type { ProductionGraphState } from './store-types';

export { MAX_GENERATE_IMAGE_REFERENCES } from './connection-rules';

export const useProductionGraphStore = create<ProductionGraphState>()(
  (set, get) => ({
    ...initialProject,
    activePipelineId: '',
    historyPast: [],
    historyFuture: [],
    pipelines: [],
    pipelineSync: {
      error: null,
      initialized: false,
      lastSyncedAt: null,
      status: 'loading',
    },
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
);
