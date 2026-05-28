import type { GraphProject } from './types';
import type { GraphSnapshot, ProductionGraphState } from './store-types';

const MAX_HISTORY_LENGTH = 50;

export function cloneSnapshot(snapshot: GraphSnapshot): GraphSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as GraphSnapshot;
}

export function getSnapshot(state: GraphProject): GraphSnapshot {
  return cloneSnapshot({
    nodes: state.nodes,
    edges: state.edges,
    assets: state.assets,
    presets: state.presets,
    runs: state.runs,
    selectedNodeIds: state.selectedNodeIds,
  });
}

export function withHistory(state: ProductionGraphState) {
  return {
    historyPast: [...state.historyPast.slice(-(MAX_HISTORY_LENGTH - 1)), getSnapshot(state)],
    historyFuture: [],
  };
}

export function pushFutureSnapshot(state: ProductionGraphState) {
  return [getSnapshot(state), ...state.historyFuture].slice(0, MAX_HISTORY_LENGTH);
}

export function pushPastSnapshot(state: ProductionGraphState) {
  return [...state.historyPast.slice(-(MAX_HISTORY_LENGTH - 1)), getSnapshot(state)];
}
