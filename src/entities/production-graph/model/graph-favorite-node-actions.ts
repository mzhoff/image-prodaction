import { createNodeFromFavoriteSnapshot } from './favorite-node-preset';
import { withHistory } from './graph-history';
import type { ProductionGraphState } from './store-types';
import type { StoreSet } from './store-action-types';

export function createGraphFavoriteNodeActions(set: StoreSet): Pick<
  ProductionGraphState,
  'addNodeFromFavorite'
> {
  return {
    addNodeFromFavorite: (snapshot, position) => {
      const node = createNodeFromFavoriteSnapshot(snapshot, position);
      set((state) => ({
        ...withHistory(state),
        nodes: [...state.nodes, node],
        selectedNodeIds: [node.id],
        selectedSectionIds: [],
      }));
      return node.id;
    },
  };
}
