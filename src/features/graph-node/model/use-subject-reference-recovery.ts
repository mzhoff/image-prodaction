'use client';

import { useEffect, useRef } from 'react';
import type { SubjectBuilderNodeData } from '@/entities/production-graph/model/types';
import { requestGenerationJob } from '../api/ai-client';
import type { Dispatch, SetStateAction } from 'react';
import type { SubjectBuilderStoreActions } from './subject-builder-action-contracts';
import {
  getSubjectReferenceSlotLabel,
  shouldDiscardGenerationRequest,
  SUBJECT_PROFILE_REFERENCE_SLOTS,
} from './subject-reference-values';

interface Params extends SubjectBuilderStoreActions {
  data: SubjectBuilderNodeData;
  generatedImageAssetIds: string[];
  imageCount: number;
  generatingReferenceTarget: string | null;
  nodeId: string;
  setGeneratingReferenceTarget: Dispatch<SetStateAction<string | null>>;
  textInputCount: number;
}

export function useSubjectReferenceRecovery(params: Params) {
  const {
    addAsset,
    data,
    generatedImageAssetIds,
    generatingReferenceTarget,
    imageCount,
    nodeId,
    setGeneratingReferenceTarget,
    setNodeStatus,
    textInputCount,
    updateNodeData,
    updateNodeDataSilent,
  } = params;
  const controllerRef = useRef<AbortController | null>(null);
  const pendingGeneration = Object.entries(data.referenceGenerationRequests ?? {})
    .find(([, request]) => Boolean(request.jobId));
  const slotId = pendingGeneration?.[0];
  const jobId = pendingGeneration?.[1].jobId;
  const recoveryStateRef = useRef({
    generatedImageAssetIds,
    imageCount,
    referenceGenerationBatchPending: data.referenceGenerationBatchPending,
    referenceGenerationRequests: data.referenceGenerationRequests,
    textInputCount,
  });
  recoveryStateRef.current = {
    generatedImageAssetIds,
    imageCount,
    referenceGenerationBatchPending: data.referenceGenerationBatchPending,
    referenceGenerationRequests: data.referenceGenerationRequests,
    textInputCount,
  };

  useEffect(() => () => controllerRef.current?.abort(), []);

  useEffect(() => {
    if (!slotId || !jobId || generatingReferenceTarget !== null) return;
    const slotIndex = SUBJECT_PROFILE_REFERENCE_SLOTS.findIndex((slot) => slot.id === slotId);
    if (slotIndex < 0) return;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setGeneratingReferenceTarget(slotId);
    setNodeStatus(nodeId, 'running');
    updateNodeDataSilent(nodeId, {
      message: `Восстанавливаем ${getSubjectReferenceSlotLabel(slotId).toLowerCase()} reference…`,
    });

    void requestGenerationJob(jobId, { signal: controller.signal }).then((response) => {
      const current = recoveryStateRef.current;
      addAsset(response.asset);
      const nextAssetIds = [...current.generatedImageAssetIds];
      nextAssetIds[slotIndex] = response.asset.id;
      const nextRequests = { ...(current.referenceGenerationRequests ?? {}) };
      delete nextRequests[slotId];
      const assetIds = SUBJECT_PROFILE_REFERENCE_SLOTS
        .map((_, index) => nextAssetIds[index])
        .filter((assetId): assetId is string => Boolean(assetId));
      updateNodeData(nodeId, {
        libraryImageAssetIds: assetIds,
        referenceGenerationBatchPending: Boolean(current.referenceGenerationBatchPending)
          && assetIds.length < SUBJECT_PROFILE_REFERENCE_SLOTS.length,
        referenceGenerationRequests: nextRequests,
        sourceCount: current.textInputCount + current.imageCount + assetIds.length,
        message: `Восстановлен результат ${getSubjectReferenceSlotLabel(slotId)} reference.`,
      });
      setNodeStatus(nodeId, 'success');
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      const nextRequests = { ...(recoveryStateRef.current.referenceGenerationRequests ?? {}) };
      if (shouldDiscardGenerationRequest(error)) delete nextRequests[slotId];
      updateNodeDataSilent(nodeId, {
        referenceGenerationRequests: nextRequests,
        message: error instanceof Error ? error.message : 'OpenRouter canonical subject reference generation failed',
      });
      setNodeStatus(nodeId, 'error');
    }).finally(() => {
      setGeneratingReferenceTarget(null);
      if (controllerRef.current === controller) controllerRef.current = null;
    });

    return () => {
      controller.abort();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [addAsset, generatingReferenceTarget, jobId, nodeId, setGeneratingReferenceTarget, setNodeStatus, slotId, updateNodeData, updateNodeDataSilent]);

  return { controllerRef, pendingReferenceJobId: jobId };
}
