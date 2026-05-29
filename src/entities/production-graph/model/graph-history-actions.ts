import { cloneSnapshot, pushFutureSnapshot, pushPastSnapshot, withHistory } from './graph-history';
import type { ProductionGraphState } from './store-types';
import type { StoreGet, StoreSet } from './store-action-types';

export function createGraphHistoryActions(set: StoreSet, get: StoreGet): Pick<
  ProductionGraphState,
  'pushHistory' | 'redo' | 'undo'
> {
  return {
    pushHistory: () => {
      set((state) => withHistory(state));
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
