'use client';

import { Upload } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useRef } from 'react';
import type { ImportImageNodeData, ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { saveImageAsset } from '@/entities/production-graph/lib/asset-db';
import { PrimaryActionButton } from '@/shared/ui/primary-action-button';
import { ImagePlate } from '../image-plate';
import { NodeTitle } from '../node-title';

export function ImportImageNode({ node }: { node: ProductionNode }) {
  const data = node.data as ImportImageNodeData;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const addAsset = useProductionGraphStore((state) => state.addAsset);
  const assignAssetToNode = useProductionGraphStore((state) => state.assignAssetToNode);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const asset = await saveImageAsset(file);
    addAsset(asset);
    assignAssetToNode(node.id, asset.id);
  };

  return (
    <>
      <NodeTitle title={data.title} nodeType={node.type} muted />
      <ImagePlate assetId={data.assetId} adaptive />
      <input ref={fileInputRef} type="file" accept="image/*,.heic,.heif" hidden onChange={handleUpload} />
      <PrimaryActionButton icon={<Upload size={16} />} onClick={() => fileInputRef.current?.click()}>
        Upload
      </PrimaryActionButton>
    </>
  );
}
