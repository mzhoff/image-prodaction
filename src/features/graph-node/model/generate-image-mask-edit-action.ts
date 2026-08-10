import { loadAssetBlob, saveTransientImageAsset } from '@/entities/production-graph/lib/asset-db';
import { getActiveAssetScope } from '@/entities/production-graph/lib/remote-asset';
import { appendGenerationResult } from '@/entities/production-graph/model/generation-history';
import type { ProductionGraphState } from '@/entities/production-graph/model/store-types';
import type { AssetRecord, GenerateImageNodeData } from '@/entities/production-graph/model/types';
import { blobToDataUrl, dataUrlToFile } from '@/shared/lib/image-data-url';
import { createRequestFingerprint } from '@/shared/lib/request-fingerprint';
import { AiRequestError, requestEditImage } from '../api/ai-client';

interface Params extends Pick<
  ProductionGraphState,
  'addAsset' | 'setNodeStatus' | 'updateNodeData' | 'updateNodeDataSilent'
> {
  assets: AssetRecord[];
  data: GenerateImageNodeData;
  nodeId: string;
  selectedAspectRatio: string;
  selectedSize: string;
}

interface MaskEditInput {
  assetId: string;
  maskDataUrl: string;
  model: string;
  prompt: string;
}

export function createGenerateImageMaskEditAction(params: Params) {
  return async ({ assetId, maskDataUrl, model, prompt }: MaskEditInput) => {
    try {
      params.setNodeStatus(params.nodeId, 'running');
      const sourceAsset = params.assets.find((asset) => asset.id === assetId);
      if (!sourceAsset) throw new Error('Активное изображение не найдено в локальном графе.');
      const sourceBlob = await loadAssetBlob(sourceAsset);
      if (!sourceBlob) throw new Error('Не удалось прочитать активное изображение из локального хранилища.');
      const scope = getActiveAssetScope();
      if (!scope) throw new Error('Document generation storage is not ready. Reload the document and try again.');
      const requestPayload = {
        ...scope,
        aspectRatio: params.selectedAspectRatio,
        imageDataUrl: await blobToDataUrl(sourceBlob),
        maskDataUrl,
        model,
        prompt,
        size: params.selectedSize,
      };
      const fingerprint = await createRequestFingerprint(requestPayload);
      const idempotencyKey = params.data.editGenerationRequest?.fingerprint === fingerprint
        ? params.data.editGenerationRequest.idempotencyKey
        : crypto.randomUUID();
      params.updateNodeDataSilent(params.nodeId, { editGenerationRequest: { fingerprint, idempotencyKey } });
      const result = await requestEditImage({ ...requestPayload, idempotencyKey });
      const file = await dataUrlToFile(result.imageDataUrl, `edited-${Date.now()}.png`);
      const editedAsset = await saveTransientImageAsset(file);
      params.addAsset(editedAsset);
      params.updateNodeData(params.nodeId, {
        ...appendGenerationResult(params.data, editedAsset.id),
        resultMetadata: {
          ...params.data.resultMetadata,
          [editedAsset.id]: { aspectRatio: params.selectedAspectRatio, model, size: params.selectedSize },
        },
        editGenerationRequest: undefined,
        message: result.message,
      });
      params.setNodeStatus(params.nodeId, 'success');
    } catch (error) {
      params.setNodeStatus(params.nodeId, 'error');
      if (shouldDiscardGenerationRequest(error)) {
        params.updateNodeDataSilent(params.nodeId, { editGenerationRequest: undefined });
      }
      throw error;
    }
  };
}

export function shouldDiscardGenerationRequest(error: unknown) {
  return error instanceof AiRequestError && error.code !== 'generation_in_progress' && error.status < 500;
}
