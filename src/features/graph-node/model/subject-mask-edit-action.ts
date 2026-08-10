import { loadAssetBlob, saveTransientImageAsset } from '@/entities/production-graph/lib/asset-db';
import { getActiveAssetScope } from '@/entities/production-graph/lib/remote-asset';
import type { AssetRecord, SubjectBuilderNodeData } from '@/entities/production-graph/model/types';
import { blobToDataUrl, dataUrlToFile } from '@/shared/lib/image-data-url';
import { createRequestFingerprint } from '@/shared/lib/request-fingerprint';
import { requestEditImage } from '../api/ai-client';
import type { SubjectBuilderStoreActions } from './subject-builder-action-contracts';
import {
  getSubjectReferenceSlotLabel,
  shouldDiscardGenerationRequest,
  SUBJECT_PROFILE_REFERENCE_SLOTS,
} from './subject-reference-values';

interface Params extends SubjectBuilderStoreActions {
  assets: AssetRecord[];
  data: SubjectBuilderNodeData;
  generatedImageAssetIds: string[];
  imageCount: number;
  nodeId: string;
  textInputCount: number;
}

interface MaskEditInput {
  assetId: string;
  maskDataUrl: string;
  model: string;
  prompt: string;
}

export function createSubjectMaskEditAction(params: Params) {
  return async (slotId: string, input: MaskEditInput) => {
    const nextEditRequests = { ...(params.data.editGenerationRequests ?? {}) };
    try {
      params.setNodeStatus(params.nodeId, 'running');
      params.updateNodeDataSilent(params.nodeId, {
        message: `Editing ${getSubjectReferenceSlotLabel(slotId).toLowerCase()} reference...`,
      });
      const sourceAsset = params.assets.find((asset) => asset.id === input.assetId);
      if (!sourceAsset) throw new Error('Активное изображение не найдено в локальном графе.');
      const sourceBlob = await loadAssetBlob(sourceAsset);
      if (!sourceBlob) throw new Error('Не удалось прочитать активное изображение из локального хранилища.');
      const scope = getActiveAssetScope();
      if (!scope) throw new Error('Document generation storage is not ready. Reload the document and try again.');
      const requestPayload = {
        ...scope,
        aspectRatio: '1:1',
        imageDataUrl: await blobToDataUrl(sourceBlob),
        maskDataUrl: input.maskDataUrl,
        model: input.model,
        prompt: input.prompt,
        size: '1K',
      };
      const fingerprint = await createRequestFingerprint(requestPayload);
      const idempotencyKey = nextEditRequests[slotId]?.fingerprint === fingerprint
        ? nextEditRequests[slotId].idempotencyKey
        : crypto.randomUUID();
      nextEditRequests[slotId] = { fingerprint, idempotencyKey };
      params.updateNodeDataSilent(params.nodeId, { editGenerationRequests: { ...nextEditRequests } });
      const result = await requestEditImage({ ...requestPayload, idempotencyKey });
      const file = await dataUrlToFile(result.imageDataUrl, `subject-${slotId}-edited-${Date.now()}.png`);
      const editedAsset = await saveTransientImageAsset(file);
      params.addAsset(editedAsset);
      delete nextEditRequests[slotId];
      const slotIndex = SUBJECT_PROFILE_REFERENCE_SLOTS.findIndex((slot) => slot.id === slotId);
      const nextAssetIds = [...params.generatedImageAssetIds];
      if (slotIndex >= 0) nextAssetIds[slotIndex] = editedAsset.id;
      const libraryImageAssetIds = SUBJECT_PROFILE_REFERENCE_SLOTS
        .map((_, index) => nextAssetIds[index])
        .filter((assetId): assetId is string => Boolean(assetId));
      params.updateNodeData(params.nodeId, {
        editGenerationRequests: nextEditRequests,
        libraryImageAssetIds,
        message: result.message || `Edited ${getSubjectReferenceSlotLabel(slotId)} subject reference.`,
        referenceModel: input.model,
        sourceCount: params.textInputCount + params.imageCount + libraryImageAssetIds.length,
      });
      params.setNodeStatus(params.nodeId, 'success');
    } catch (error) {
      params.setNodeStatus(params.nodeId, 'error');
      if (shouldDiscardGenerationRequest(error)) delete nextEditRequests[slotId];
      params.updateNodeDataSilent(params.nodeId, { editGenerationRequests: { ...nextEditRequests } });
      throw error;
    }
  };
}
