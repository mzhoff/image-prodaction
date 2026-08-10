import { loadAssetBlob } from '@/entities/production-graph/lib/asset-db';
import { getActiveAssetScope } from '@/entities/production-graph/lib/remote-asset';
import { prepareImageForOpenRouter } from '@/shared/lib/image-data-url';
import { createRequestFingerprint } from '@/shared/lib/request-fingerprint';
import { requestGenerateImage } from '../api/ai-client';
import type { SubjectReferenceGenerationContext } from './subject-builder-action-contracts';
import {
  buildSubjectReferencePrompt,
  createEmptyGenerateInputs,
  shouldDiscardGenerationRequest,
  SUBJECT_PROFILE_REFERENCE_SLOTS,
} from './subject-reference-values';

export function createSubjectReferenceGenerationAction(context: SubjectReferenceGenerationContext) {
  return async (slotId?: string) => {
    if (context.generatingReferenceTarget !== null) return;
    if (context.imageAssetIds.length === 0) {
      context.updateNodeData(context.nodeId, {
        message: 'Подключи image refs к Subject Builder, чтобы сгенерировать canonical references.',
      });
      return;
    }
    const targetSlot = slotId ? SUBJECT_PROFILE_REFERENCE_SLOTS.find((slot) => slot.id === slotId) : undefined;
    if (slotId && !targetSlot) return;
    const requests = { ...(context.data.referenceGenerationRequests ?? {}) };
    const resumeBatch = !targetSlot
      && Boolean(context.data.referenceGenerationBatchPending)
      && (context.generatedImageAssetIds.length > 0 || Object.keys(requests).length > 0);
    const generatedAssetIds = targetSlot || resumeBatch ? [...context.generatedImageAssetIds] : [];
    const slots = targetSlot
      ? [targetSlot]
      : resumeBatch
        ? SUBJECT_PROFILE_REFERENCE_SLOTS.filter((_, index) => !generatedAssetIds[index])
        : SUBJECT_PROFILE_REFERENCE_SLOTS;
    let activeSlotId: string | null = null;
    const controller = new AbortController();
    context.controllerRef.current?.abort();
    context.controllerRef.current = controller;

    try {
      context.setGeneratingReferenceTarget(targetSlot?.id ?? 'all');
      context.setNodeStatus(context.nodeId, 'running');
      context.updateNodeDataSilent(context.nodeId, {
        referenceGenerationBatchPending: targetSlot ? context.data.referenceGenerationBatchPending : true,
        message: targetSlot
          ? `Regenerating ${targetSlot.label.toLowerCase()} reference...`
          : 'Generating canonical subject references...',
      });
      const sourceImages = await loadSourceImages(context);
      const subjectPassport = context.result.trim();
      const scope = getActiveAssetScope();
      if (!scope) throw new Error('Document generation storage is not ready. Reload the document and try again.');

      for (const slot of slots) {
        activeSlotId = slot.id;
        context.updateNodeDataSilent(context.nodeId, { message: `Generating ${slot.label.toLowerCase()} reference...` });
        const payload = {
          aspectRatio: '1:1',
          ...scope,
          inputs: createEmptyGenerateInputs(),
          model: context.selectedReferenceModel,
          prompt: buildSubjectReferencePrompt({
            slotId: slot.id,
            slotLabel: slot.label,
            subjectPassport,
            subjectType: context.subjectType,
            textNotes: context.textInputs.map((input) => input.text),
          }),
          referenceImages: sourceImages.map((dataUrl) => ({
            dataUrl,
            slots: ['actors'],
            sourceNodeTypes: ['subjectBuilder'],
          })),
          size: '1K',
          subjectInputs: subjectPassport ? [subjectPassport] : [],
        };
        const fingerprint = await createRequestFingerprint(payload);
        const idempotencyKey = requests[slot.id]?.fingerprint === fingerprint
          ? requests[slot.id].idempotencyKey
          : crypto.randomUUID();
        requests[slot.id] = { fingerprint, idempotencyKey };
        context.updateNodeDataSilent(context.nodeId, { referenceGenerationRequests: { ...requests } });
        const response = await requestGenerateImage(
          { ...payload, idempotencyKey },
          {
            signal: controller.signal,
            onJobAccepted(jobId) {
              requests[slot.id] = { fingerprint, idempotencyKey, jobId };
              context.updateNodeDataSilent(context.nodeId, { referenceGenerationRequests: { ...requests } });
            },
          },
        );
        context.addAsset(response.asset);
        const slotIndex = SUBJECT_PROFILE_REFERENCE_SLOTS.findIndex((item) => item.id === slot.id);
        if (targetSlot) generatedAssetIds[slotIndex] = response.asset.id;
        else generatedAssetIds.push(response.asset.id);
        delete requests[slot.id];
        checkpointGeneration(context, generatedAssetIds, requests);
      }
      completeGeneration(context, generatedAssetIds, requests, targetSlot);
    } catch (error) {
      if (controller.signal.aborted) return;
      context.setNodeStatus(context.nodeId, 'error');
      if (activeSlotId && shouldDiscardGenerationRequest(error)) delete requests[activeSlotId];
      context.updateNodeDataSilent(context.nodeId, {
        referenceGenerationRequests: { ...requests },
        message: error instanceof Error ? error.message : 'OpenRouter canonical subject reference generation failed',
      });
    } finally {
      context.setGeneratingReferenceTarget(null);
      if (context.controllerRef.current === controller) context.controllerRef.current = null;
    }
  };
}

async function loadSourceImages(context: SubjectReferenceGenerationContext) {
  return Promise.all(context.imageAssetIds.slice(0, 4).map(async (assetId) => {
    const asset = context.assets.find((item) => item.id === assetId);
    if (!asset) throw new Error('Один из image refs не найден в локальном графе.');
    const blob = await loadAssetBlob(asset);
    if (!blob) throw new Error(`Не удалось прочитать image ref "${asset.name}" из локального хранилища.`);
    return prepareImageForOpenRouter(blob);
  }));
}

function getOrderedAssetIds(assetIds: string[]) {
  return SUBJECT_PROFILE_REFERENCE_SLOTS
    .map((_, index) => assetIds[index])
    .filter((assetId): assetId is string => Boolean(assetId));
}

function checkpointGeneration(
  context: SubjectReferenceGenerationContext,
  generatedAssetIds: string[],
  requests: SubjectBuilderNodeDataRequests,
) {
  const assetIds = getOrderedAssetIds(generatedAssetIds);
  context.updateNodeDataSilent(context.nodeId, {
    libraryImageAssetIds: assetIds,
    referenceGenerationRequests: { ...requests },
    sourceCount: context.textInputs.length + context.imageCount + assetIds.length,
  });
}

type SubjectBuilderNodeDataRequests = NonNullable<SubjectReferenceGenerationContext['data']['referenceGenerationRequests']>;

function completeGeneration(
  context: SubjectReferenceGenerationContext,
  generatedAssetIds: string[],
  requests: SubjectBuilderNodeDataRequests,
  targetSlot?: { id: string; label: string },
) {
  const assetIds = getOrderedAssetIds(generatedAssetIds);
  context.updateNodeData(context.nodeId, {
    libraryImageAssetIds: assetIds,
    message: targetSlot
      ? `Regenerated ${targetSlot.label} canonical subject reference.`
      : 'Generated 4 canonical subject references.',
    referenceModel: context.selectedReferenceModel,
    referenceGenerationBatchPending: targetSlot ? context.data.referenceGenerationBatchPending : false,
    referenceGenerationRequests: requests,
    sourceCount: context.textInputs.length + context.imageCount + assetIds.length,
  });
  context.setNodeStatus(context.nodeId, 'success');
}
