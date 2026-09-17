import { cloneSnapshot, getSnapshot, pushFutureSnapshot, pushPastSnapshot, withHistory } from './graph-history';
import type { ProductionGraphState } from './store-types';
import type { StoreGet, StoreSet } from './store-action-types';

export function createGraphHistoryActions(set: StoreSet, get: StoreGet): Pick<
  ProductionGraphState,
  'pushHistory' | 'redo' | 'runInHistoryBatch' | 'undo'
> {
  return {
    pushHistory: () => {
      set((state) => withHistory(state));
    },
    runInHistoryBatch: (operation) => {
      const stateBefore = get();
      const snapshotBefore = getSnapshot(stateBefore);
      const historyBefore = stateBefore.historyPast;

      operation();

      set({
        historyPast: [...historyBefore.slice(-49), snapshotBefore],
        historyFuture: [],
      });
    },
    undo: () => {
      const state = get();
      const previous = state.historyPast.at(-1);
      if (!previous) return;

      set({
        ...cloneSnapshot(previous),
        historyPast: state.historyPast.slice(0, -1),
        historyFuture: pushFutureSnapshot(state),
      });
    },
    redo: () => {
      const state = get();
      const next = state.historyFuture[0];
      if (!next) return;

      set({
        ...cloneSnapshot(next),
        historyPast: pushPastSnapshot(state),
        historyFuture: state.historyFuture.slice(1),
      });
    },
  };
}
