import {
  createPipelineTemplateExport,
  createProjectSnapshotExport,
  normalizePortableProjectExport,
} from './project-portability';
import { withHistory } from './graph-history';
import type { ProductionGraphState } from './store-types';
import type { StoreGet, StoreSet } from './store-action-types';
import type { GraphProject } from './types';

export function createGraphPortabilityActions(set: StoreSet, get: StoreGet): Pick<
  ProductionGraphState,
  'exportPipelineTemplate' | 'exportProjectSnapshot' | 'importPortableProject'
> {
  return {
    exportProjectSnapshot: () => createProjectSnapshotExport(getGraphProject(get()), get().uiState),
    exportPipelineTemplate: () => createPipelineTemplateExport(getGraphProject(get()), get().uiState),
    importPortableProject: (payload, expectedKind) => {
      const imported = normalizePortableProjectExport(payload);
      if (expectedKind && imported.kind !== expectedKind) {
        throw new Error(getPortableKindMismatchMessage(expectedKind));
      }

      set((state) => ({
        ...withHistory(state),
        ...imported.project,
        uiState: imported.uiState,
        historyFuture: [],
      }));
      return { kind: imported.kind };
    },
  };
}

function getPortableKindMismatchMessage(expectedKind: 'projectSnapshot' | 'pipelineTemplate') {
  return expectedKind === 'pipelineTemplate'
    ? 'Выбран project snapshot JSON. Нужен pipeline template JSON.'
    : 'Выбран pipeline template JSON. Нужен project snapshot JSON.';
}

function getGraphProject(state: ProductionGraphState): GraphProject {
  return {
    version: state.version,
    nodes: state.nodes,
    sections: state.sections,
    edges: state.edges,
    assets: state.assets,
    presets: state.presets,
    runs: state.runs,
    selectedNodeIds: state.selectedNodeIds,
    selectedSectionIds: state.selectedSectionIds,
  };
}
