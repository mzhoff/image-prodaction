import type { ExportImageNodeData, ProductionNode } from './types';

export function invalidateExportImageResult(nodes: ProductionNode[], nodeId: string) {
  return nodes.map((node) => {
    if (node.id !== nodeId || node.type !== 'exportImage') return node;
    const data = node.data as ExportImageNodeData;
    if (!data.resultAssetId && !data.resultSignature && !data.sourceAssetId && node.status !== 'running') return node;
    return {
      ...node,
      data: {
        ...data,
        resultAssetId: undefined,
        resultSignature: undefined,
        sourceAssetId: undefined,
      },
      status: 'idle' as const,
    };
  });
}
