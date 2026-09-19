'use client';

import { useEffect, type RefObject } from 'react';
import type { GenerateImageNodeData } from '@/entities/production-graph/model/types';
import type { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { appendGenerationResult } from '@/entities/production-graph/model/generation-history';
import { getActiveAssetScope } from '@/entities/production-graph/lib/remote-asset';
import type { GenerationWaitingPhase } from '@/features/generation-waiting/model/waiting-visuals';
import { notifyAssistantNotice } from '@/features/assistant-pet/model/assistant-pet-notices';
import { recordDocumentAssistantActivity } from '@/modules/chat-assistant/adapters/client/document-activity-client';
import { requestGenerationJob } from '../api/ai-client';
import { shouldDiscardGenerationRequest } from './generate-image-mask-edit-action';

type GraphState = ReturnType<typeof useProductionGraphStore.getState>;
interface RecoveryOptions extends Pick<GraphState, 'addAsset' | 'setNodeStatus' | 'updateNodeData' | 'updateNodeDataSilent'> {
  nodeId: string;
  pendingGenerationJobId?: string;
  generationPresentationRef: RefObject<{
    data: GenerateImageNodeData;
    selectedAspectRatio: string;
    selectedModel: string;
    selectedSize: string;
  }>;
  activeGenerationJobIdRef: RefObject<string | null>;
  pollingControllerRef: RefObject<AbortController | null>;
  setGenerationWaitPhase: (phase: GenerationWaitingPhase) => void;
}

export function useGenerateImageRecovery({ nodeId, pendingGenerationJobId, generationPresentationRef,
  activeGenerationJobIdRef, pollingControllerRef, addAsset, setNodeStatus, setGenerationWaitPhase,
  updateNodeData, updateNodeDataSilent }: RecoveryOptions) {
  useEffect(() => {
    const jobId = pendingGenerationJobId;
    if (!jobId || activeGenerationJobIdRef.current === jobId) return;
    const controller = new AbortController();
    pollingControllerRef.current?.abort();
    pollingControllerRef.current = controller;
    activeGenerationJobIdRef.current = jobId;
    setNodeStatus(nodeId, 'running');
    setGenerationWaitPhase('queued');
    updateNodeDataSilent(nodeId, {
      message: 'Восстанавливаем незавершённую генерацию…',
    });
    void requestGenerationJob(jobId, {
      signal: controller.signal,
      onJobUpdate(job) {
        if (job.status === 'queued' || job.status === 'running') setGenerationWaitPhase(job.status);
      },
    }).then((result) => {
      const current = generationPresentationRef.current;
      const asset = result.asset;
      setGenerationWaitPhase('saving');
      addAsset(asset);
      updateNodeData(nodeId, {
        ...appendGenerationResult(current.data, asset.id),
        resultMetadata: {
          ...current.data.resultMetadata,
          [asset.id]: {
            aspectRatio: current.selectedAspectRatio,
            model: current.selectedModel,
            size: current.selectedSize,
          },
        },
        generationRequest: undefined,
        message: result.message,
      });
      setNodeStatus(nodeId, 'success');
      const scope = getActiveAssetScope();
      notifyAssistantNotice({
        id: `image-generated:${asset.id}`,
        status: 'success',
        title: 'Изображение готово',
        subtitle: 'Ровер закончил задачу. Открой чат, чтобы найти источник.',
        nodeId: nodeId,
      });
      if (scope) {
        void recordDocumentAssistantActivity({
          documentId: scope.documentId,
          workspaceId: scope.workspaceId,
          kind: 'image-generated',
          model: current.selectedModel,
          assetId: asset.id,
          nodeId: nodeId,
        }).catch(() => undefined);
      }
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setNodeStatus(nodeId, 'error');
      if (shouldDiscardGenerationRequest(error)) {
        updateNodeDataSilent(nodeId, { generationRequest: undefined });
      }
      updateNodeDataSilent(nodeId, {
        message: error instanceof Error ? error.message : 'OpenRouter generation failed',
      });
    }).finally(() => {
      if (activeGenerationJobIdRef.current === jobId) {
        activeGenerationJobIdRef.current = null;
      }
      if (pollingControllerRef.current === controller) {
        pollingControllerRef.current = null;
      }
    });
    return () => {
      controller.abort();
      if (activeGenerationJobIdRef.current === jobId) {
        activeGenerationJobIdRef.current = null;
      }
      if (pollingControllerRef.current === controller) {
        pollingControllerRef.current = null;
      }
    };
  }, [
    activeGenerationJobIdRef, generationPresentationRef, pollingControllerRef, setGenerationWaitPhase,
    addAsset,
    nodeId,
    pendingGenerationJobId,
    setNodeStatus,
    updateNodeData,
    updateNodeDataSilent,
  ]);

}
