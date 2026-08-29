'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { saveTransientImageAsset } from '@/entities/production-graph/lib/asset-db';
import { getIncomingTextInputs } from '@/entities/production-graph/model/graph-io';
import type { ProductionNode, QrCodeNodeData } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { dataUrlToFile } from '@/shared/lib/image-data-url';
import {
  QR_CODE_DEFAULTS,
  normalizeQrCodeContent,
  normalizeQrCodeOptions,
  type QrCodeContentMode,
  type QrCodeOptions,
} from '@/shared/qr-code';
import { resolveQrCodeEffectiveContent } from './qr-code-node-content';

export function useQrCodeNodeModel(node: ProductionNode) {
  const data = node.data as QrCodeNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const addAsset = useProductionGraphStore((state) => state.addAsset);
  const setNodeStatus = useProductionGraphStore((state) => state.setNodeStatus);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodeDataSilent = useProductionGraphStore((state) => state.updateNodeDataSilent);
  const incomingInput = useMemo(
    () => getIncomingTextInputs(node.id, 'text', { edges, nodes })[0],
    [edges, node.id, nodes],
  );
  const incomingEdge = useMemo(
    () => edges.find((edge) => edge.targetNodeId === node.id && edge.targetPortId === 'text'),
    [edges, node.id],
  );
  const effectiveContent = resolveQrCodeEffectiveContent({
    hasIncomingEdge: Boolean(incomingEdge),
    incomingText: incomingInput?.text,
    localContent: data.content,
  });
  const incomingInputLabel = incomingInput?.sourceLabel
    ?? nodes.find((item) => item.id === incomingEdge?.sourceNodeId)?.data.title;
  const options = useMemo(() => {
    try {
      return normalizeQrCodeOptions(data as unknown as Record<string, unknown>);
    } catch {
      return { ...QR_CODE_DEFAULTS };
    }
  }, [data]);
  const validationMessage = useMemo(
    () => getQrCodeValidationMessage(effectiveContent, options.contentMode),
    [effectiveContent, options.contentMode],
  );
  const currentSignature = useMemo(
    () => createQrCodeSignatureOrUndefined(effectiveContent, options),
    [effectiveContent, options],
  );

  useEffect(() => {
    if (!data.resultAssetId || data.resultSignature === currentSignature) return;
    updateNodeDataSilent(node.id, {
      resultAssetId: undefined,
      resultSignature: undefined,
    });
  }, [currentSignature, data.resultAssetId, data.resultSignature, node.id, updateNodeDataSilent]);

  const handleGenerate = useCallback(async () => {
    try {
      const content = normalizeQrCodeContent(effectiveContent, options.contentMode);
      const signature = createQrCodeSignature(content, options);
      setNodeStatus(node.id, 'running');
      updateNodeDataSilent(node.id, { message: '' });

      const qrCode = await import('qrcode');
      const dataUrl = await qrCode.toDataURL(content, {
        color: {
          dark: options.foregroundColor,
          light: options.backgroundColor,
        },
        errorCorrectionLevel: options.errorCorrectionLevel,
        margin: options.margin,
        type: 'image/png',
        width: options.pixelSize,
      });
      const file = await dataUrlToFile(dataUrl, `qr-code-${Date.now()}.png`);
      const asset = await saveTransientImageAsset(file);
      addAsset(asset);
      updateNodeData(node.id, {
        message: '',
        resultAssetId: asset.id,
        resultSignature: signature,
      });
      setNodeStatus(node.id, 'success');
    } catch (error) {
      updateNodeDataSilent(node.id, {
        message: error instanceof Error ? error.message : 'QR code generation failed.',
        resultAssetId: undefined,
        resultSignature: undefined,
      });
      setNodeStatus(node.id, 'error');
    }
  }, [addAsset, effectiveContent, node.id, options, setNodeStatus, updateNodeData, updateNodeDataSilent]);

  const clearResult = useCallback((patch: Partial<QrCodeNodeData>) => {
    updateNodeData(node.id, {
      ...patch,
      message: '',
      resultAssetId: undefined,
      resultSignature: undefined,
    });
  }, [node.id, updateNodeData]);

  return {
    data,
    effectiveContent,
    handleContentChange: (content: string) => clearResult({ content }),
    handleGenerate,
    handleModeChange: (contentMode: QrCodeContentMode) => clearResult({ contentMode }),
    hasIncomingInput: Boolean(incomingEdge),
    incomingInputLabel,
    options,
    validationMessage,
  };
}

export function createQrCodeSignature(content: string, options: QrCodeOptions) {
  const value = JSON.stringify({ content, ...options });
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `qr:v1:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function createQrCodeSignatureOrUndefined(content: string, options: QrCodeOptions) {
  try {
    return createQrCodeSignature(normalizeQrCodeContent(content, options.contentMode), options);
  } catch {
    return undefined;
  }
}

function getQrCodeValidationMessage(content: string, mode: QrCodeContentMode) {
  if (!content.trim()) return undefined;
  try {
    normalizeQrCodeContent(content, mode);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : 'QR content is invalid.';
  }
}
