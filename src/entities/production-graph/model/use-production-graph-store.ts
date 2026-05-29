'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createGraphConnectionActions } from './graph-connection-actions';
import { createGraphHistoryActions } from './graph-history-actions';
import { createGraphNodeActions } from './graph-node-actions';
import { createGraphSelectionActions } from './graph-selection-actions';
import { initialProject } from './initial-project';
import { normalizeProject } from './normalize-project';
import type { GraphProject } from './types';
import type { ProductionGraphState } from './store-types';

export { MAX_GENERATE_IMAGE_REFERENCES } from './connection-rules';

export const useProductionGraphStore = create<ProductionGraphState>()(
  persist(
    (set, get) => ({
      ...initialProject,
      historyPast: [],
      historyFuture: [],
      ...createGraphNodeActions(set),
      ...createGraphConnectionActions(set, get),
      ...createGraphSelectionActions(set, get),
      ...createGraphHistoryActions(set, get),
    }),
    {
      name: 'reverie-image-production-project:v1',
      partialize: (state) => ({
        version: state.version,
        nodes: state.nodes,
        edges: state.edges,
        assets: state.assets,
        presets: state.presets,
        runs: state.runs,
        selectedNodeIds: state.selectedNodeIds,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...normalizeProject({ ...initialProject, ...(persisted as Partial<GraphProject>) }),
        historyPast: [],
        historyFuture: [],
      }),
    },
  ),
);
