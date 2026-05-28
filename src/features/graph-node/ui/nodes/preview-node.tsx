'use client';

import { useMemo } from 'react';
import type { PreviewNodeData, ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { ImagePlate } from '../image-plate';
import { NodeTitle } from '../node-title';

export function PreviewNode({ node }: { node: ProductionNode }) {
  const data = node.data as PreviewNodeData;
  const assets = useProductionGraphStore((state) => state.assets);
  const firstImageAsset = useMemo(() => assets.find((asset) => asset.kind === 'image'), [assets]);

  return (
    <>
      <NodeTitle title={data.title} muted />
      <ImagePlate assetId={data.assetId ?? firstImageAsset?.id} />
      <div className="node-block">
        <div className="node-label">Output</div>
        <div className="node-note">
          Здесь будет показываться результат генерации или выбранный image asset.
        </div>
      </div>
    </>
  );
}
