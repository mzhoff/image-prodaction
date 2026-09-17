import type { GraphImageInputItem } from '@/entities/production-graph/model/graph-io-contracts';

type PreviewItem = Pick<GraphImageInputItem, 'edge' | 'assetId'>;

export function getExportPreviewKey(item: PreviewItem) {
  return `${item.edge.id}:${item.assetId}`;
}

export function getExportPreviewIndex(items: PreviewItem[], selectedKey?: string, primaryAssetId?: string) {
  if (items.length === 0) return -1;
  const selected = items.findIndex((item) => getExportPreviewKey(item) === selectedKey);
  if (selected >= 0) return selected;
  const primary = items.findIndex((item) => item.assetId === primaryAssetId);
  return Math.max(0, primary);
}
