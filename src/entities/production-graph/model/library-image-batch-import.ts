import { createDefaultNodeSize } from './node-layout';
import type { AssetRecord, GraphPoint } from './types';
import { useProductionGraphStore } from './use-production-graph-store';

/** One user action, stable IDs for reload/retry, original assets reused without upload. */
export function insertLibraryImageBatch(entries: Array<{ asset: AssetRecord; nodeId?: string }>, position: GraphPoint) {
  const graph = useProductionGraphStore.getState();
  const pending = entries.filter((entry) => !entry.nodeId || !graph.nodes.some((node) => node.id === entry.nodeId));
  if (!pending.length) return;
  const width = createDefaultNodeSize('importImage').width;
  graph.runInHistoryBatch(() => {
    let rowY = position.y;
    let rowHeight = 0;
    pending.forEach(({ asset, nodeId }, index) => {
      const column = index % 3;
      if (column === 0 && index) { rowY += rowHeight + 60; rowHeight = 0; }
      rowHeight = Math.max(rowHeight, width * (asset.height ?? 1) / Math.max(1, asset.width ?? 1) + 160, 340);
      graph.pasteImageAsset(asset, { x: position.x + column * (width + 60), y: rowY }, undefined, nodeId);
    });
  });
}
