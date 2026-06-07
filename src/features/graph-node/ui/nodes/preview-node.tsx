'use client';

import { useMemo } from 'react';
import type { PreviewNodeData, ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { getFirstIncomingImageAsset } from '@/entities/production-graph/model/graph-io';
import { ImagePlate } from '../image-plate';
import { NodeTitle } from '../node-title';

export function PreviewNode({ node }: { node: ProductionNode }) {
  const data = node.data as PreviewNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const assets = useProductionGraphStore((state) => state.assets);
  const sourceAsset = useMemo(() => (
    getFirstIncomingImageAsset(node.id, 'image', { edges, nodes, assets })
  ), [assets, edges, node.id, nodes]);

  return (
    <>
      <NodeTitle title={data.title} nodeType={node.type} muted />
      <ImagePlate assetId={sourceAsset?.id ?? data.assetId} />
    </>
  );
}
