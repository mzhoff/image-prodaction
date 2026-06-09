import type { ProjectNodeUiState, ProjectSectionUiState } from './project-schema';
import type { ProductionGraphState } from './store-types';
import type { StoreSet } from './store-action-types';
import { applyNodeDisplayState } from './project-schema';

export function createGraphUiStateActions(set: StoreSet): Pick<
  ProductionGraphState,
  'setNodeUiState' | 'setProjectUiViewport' | 'setSectionUiState'
> {
  return {
    setProjectUiViewport: (viewport) => {
      set((state) => ({
        uiState: {
          ...state.uiState,
          viewport,
        },
      }));
    },
    setNodeUiState: (nodeId, nodeUiState) => {
      const nextNodeState = applyNodeDisplayState(nodeUiState);
      set((state) => ({
        uiState: {
          ...state.uiState,
          nodes: setRecordPatch(state.uiState.nodes, nodeId, nextNodeState),
        },
      }));
    },
    setSectionUiState: (sectionId, sectionUiState) => {
      set((state) => ({
        uiState: {
          ...state.uiState,
          sections: setRecordPatch(state.uiState.sections, sectionId, sectionUiState),
        },
      }));
    },
  };
}

function setRecordPatch<T extends ProjectNodeUiState | ProjectSectionUiState>(
  record: Record<string, T>,
  id: string,
  patch: Partial<T>,
) {
  const nextRecord = { ...record };
  const nextValue = Object.fromEntries(
    Object.entries({ ...record[id], ...patch }).filter(([, value]) => value !== undefined),
  ) as unknown as T;

  if (Object.keys(nextValue).length === 0) {
    delete nextRecord[id];
  } else {
    nextRecord[id] = nextValue;
  }

  return nextRecord;
}
