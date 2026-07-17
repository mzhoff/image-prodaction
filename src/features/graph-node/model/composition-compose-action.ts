'use client';

import { loadAssetBlob, saveTransientImageAsset } from '@/entities/production-graph/lib/asset-db';
import type { AssetRecord, ProductionNodeData } from '@/entities/production-graph/model/types';
import { renderCompositionToBlob, type CompositionRenderLayer } from '../lib/composition-render';
import type { CompositionLayerView } from './composition-model-types';

interface ComposeCompositionResultParams {
  addAsset: (asset: AssetRecord) => void;
  canvasHeight: number;
  canvasWidth: number;
  currentResultSignature: string;
  nodeId: string;
  setNodeStatus: (nodeId: string, status: 'idle' | 'running' | 'success' | 'error') => void;
  updateNodeData: (nodeId: string, data: Partial<ProductionNodeData>) => void;
  updateNodeDataSilent: (nodeId: string, data: Partial<ProductionNodeData>) => void;
  visibleConnectedLayers: CompositionLayerView[];
}

  export async function composeCompositionResult(params: ComposeCompositionResultParams, options: { silent?: boolean } = {}) {
  const { addAsset, canvasHeight, canvasWidth, currentResultSignature, nodeId, setNodeStatus, updateNodeData, updateNodeDataSilent, visibleConnectedLayers } = params;
    try {
      setNodeStatus(nodeId, 'running');
      updateNodeDataSilent(nodeId, { message: '' });
      const renderLayers: CompositionRenderLayer[] = [];
      for (const layer of visibleConnectedLayers) {
        if (layer.kind === 'image' && layer.asset) {
          const blob = await loadAssetBlob(layer.asset);
          if (!blob) throw new Error(`Не удалось прочитать слой ${layer.name}.`);
          renderLayers.push({
            assetName: layer.asset.name,
            blendMode: layer.style.blendMode,
            blob,
            fit: layer.style.fit,
            flipX: layer.style.flipX,
            flipY: layer.style.flipY,
            height: layer.style.height,
            kind: 'image',
            opacity: layer.style.opacity,
            rotation: layer.style.rotation,
            width: layer.style.width,
            x: layer.style.x,
            y: layer.style.y,
          });
        }
        if (layer.kind === 'text' && layer.text?.trim()) {
          renderLayers.push({
            align: layer.style.align,
            blendMode: layer.style.blendMode,
            color: layer.style.color,
            flipX: layer.style.flipX,
            flipY: layer.style.flipY,
            fontFamily: layer.style.fontFamily,
            fontSize: layer.style.fontSize,
            fontWeight: layer.style.fontWeight,
            height: layer.style.height,
            kind: 'text',
            letterSpacing: layer.style.letterSpacing,
            lineHeight: layer.style.lineHeight,
            opacity: layer.style.opacity,
            rotation: layer.style.rotation,
            text: layer.text,
            verticalAlign: layer.style.verticalAlign,
            width: layer.style.width,
            x: layer.style.x,
            y: layer.style.y,
          });
        }
      }

      const blob = await renderCompositionToBlob({ height: canvasHeight, layers: renderLayers, width: canvasWidth });
      const file = new File([blob], `composition-${Date.now()}.png`, { type: 'image/png' });
      const asset = await saveTransientImageAsset(file);
      addAsset(asset);
      const updateResult = options.silent ? updateNodeDataSilent : updateNodeData;
      updateResult(nodeId, {
        message: `${asset.width ?? canvasWidth}x${asset.height ?? canvasHeight} · PNG`,
        resultAssetId: asset.id,
        resultSignature: currentResultSignature,
      });
      setNodeStatus(nodeId, 'success');
    } catch (error) {
      setNodeStatus(nodeId, 'error');
      updateNodeDataSilent(nodeId, {
        message: error instanceof Error ? error.message : 'Не удалось собрать композицию.',
      });
    }
  };
