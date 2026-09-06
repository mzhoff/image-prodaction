import { createNodeFromFavoriteSnapshot } from './favorite-node-preset';
import { withHistory } from './graph-history';
import type { ProductionGraphState } from './store-types';
import type { StoreSet } from './store-action-types';

export function createGraphFavoriteNodeActions(set: StoreSet): Pick<
  ProductionGraphState,
  'addNodeFromFavorite'
> {
  return {
    addNodeFromFavorite: (snapshot, position, assets = []) => {
      const node = createNodeFromFavoriteSnapshot(snapshot, position);
      const assetIds = new Set(assets.map((asset) => asset.id));
      set((state) => ({
        ...withHistory(state),
        assets: assets.length ? [...state.assets.filter((asset) => !assetIds.has(asset.id)), ...assets] : state.assets,
        nodes: [...state.nodes, node],
        selectedNodeIds: [node.id],
        selectedSectionIds: [],
      }));
      return node.id;
    },
  };
}
