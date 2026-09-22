'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useGenerateImageRecovery } from './use-generate-image-recovery';
import { getGenerateImageSelection, getGenerateImageModelChange } from './generate-image-selection';
import { getInputConnectionStatus } from '../lib/input-connection-status';
import { useEffect, useMemo, useRef, useState } from 'react';
import { appendGenerationResult, getGenerationHistory, selectGenerationResult } from '@/entities/production-graph/model/generation-history';
import type { GenerateImageNodeData, ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { requestGenerateImage } from '../api/ai-client';
import { useOpenRouterModels } from '@/shared/api/use-openrouter-models';
import { getActiveAssetScope } from '@/entities/production-graph/lib/remote-asset';
import { createRequestFingerprint } from '@/shared/lib/request-fingerprint';
import {
  buildGeneratePayload,
  getGenerateInputKinds,
} from '../lib/generate-node-inputs';
import { modelSelectOptions, valueSelectOptions } from '../lib/node-select-options';
import { pickImageGenerationOptions, type ImageGenerationOptions } from '@/shared/media/image-generation-settings';
import { validateImageSettings } from '@/shared/api/image-model-capabilities';
import {
  createGenerateImageMaskEditAction,
  shouldDiscardGenerationRequest,
} from './generate-image-mask-edit-action';
import type { GenerationWaitingPhase } from '@/features/generation-waiting/model/waiting-visuals';
import { notifyAssistantNotice } from '@/features/assistant-pet/model/assistant-pet-notices';
import { recordDocumentAssistantActivity } from '@/modules/chat-assistant/adapters/client/document-activity-client';
import { trackBehavior } from '@/shared/analytics/client';

interface UseGenerateImageNodeModelParams {
  composingOpen: boolean;
  node: ProductionNode;
  onComposingOpenChange: (open: boolean) => void;
}

export function useGenerateImageNodeModel({
  composingOpen,
  node,
  onComposingOpenChange,
}: UseGenerateImageNodeModelParams) {
  const tUi = useTranslations();
  const data = node.data as GenerateImageNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const assets = useProductionGraphStore((state) => state.assets);
  const addAsset = useProductionGraphStore((state) => state.addAsset);
  const setNodeStatus = useProductionGraphStore((state) => state.setNodeStatus);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodeDataSilent = useProductionGraphStore((state) => state.updateNodeDataSilent);
  const updateNodePrompt = useProductionGraphStore((state) => state.updateNodePrompt);
  const catalog = useOpenRouterModels();
  const { loading } = catalog;
  const { imageModels, selectedModel, selectedImageModel, aspectRatios, sizes, selectedAspectRatio,
    selectedSize, promptRows, legacyReferenceRows } = getGenerateImageSelection(node, edges, nodes, catalog);
  const generationHistory = useMemo(() => getGenerationHistory(data), [data]);
  const [promptOpen, setPromptOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [resultOpen, setResultOpen] = useState(true);
  const [generationWaitPhase, setGenerationWaitPhase] = useState<GenerationWaitingPhase>('submitting');
  const activeGenerationJobIdRef = useRef<string | null>(null);
  const pollingControllerRef = useRef<AbortController | null>(null);
  const generationPresentationRef = useRef({
    data,
    selectedAspectRatio,
    selectedModel,
    selectedSize,
  });
  generationPresentationRef.current = {
    data,
    selectedAspectRatio,
    selectedModel,
    selectedSize,
  };
  const pendingGenerationJobId = data.generationRequest?.jobId;
  const allSectionsOpen = promptOpen && settingsOpen && composingOpen && resultOpen;

  useEffect(() => () => {
    pollingControllerRef.current?.abort();
  }, []);

  useGenerateImageRecovery({ nodeId: node.id, pendingGenerationJobId, generationPresentationRef,
    activeGenerationJobIdRef, pollingControllerRef, addAsset, setNodeStatus, setGenerationWaitPhase,
    updateNodeData, updateNodeDataSilent });

  const toggleAllSections = () => {
    const nextOpen = !allSectionsOpen;
    setPromptOpen(nextOpen);
    setSettingsOpen(nextOpen);
    setResultOpen(nextOpen);
    onComposingOpenChange(nextOpen);
  };

  const handleModelChange = (model: string) => updateNodeData(node.id, getGenerateImageModelChange(model, data, imageModels));

  const handleGenerate = async () => {
    const controller = new AbortController();
    pollingControllerRef.current?.abort();
    pollingControllerRef.current = controller;
    try {
      setNodeStatus(node.id, 'running');
      setGenerationWaitPhase('submitting');
      updateNodeDataSilent(node.id, { message: '' });
      const payload = await buildGeneratePayload(node.id, edges, nodes, assets);
      const prompt = [...payload.promptInputs, data.prompt ?? ''].filter((item) => item.trim()).join('\n\n');
      const scope = getActiveAssetScope();
      if (!scope) throw new Error('Document generation storage is not ready. Reload the document and try again.');
      const requestPayload = {
        ...payload,
        ...scope,
        ...pickImageGenerationOptions(data),
        model: selectedModel,
        aspectRatio: selectedAspectRatio,
        size: selectedSize,
        prompt,
      };
      if (!selectedImageModel) throw new Error(tUi("Выбранная модель недоступна. Обновите каталог или выберите другую модель."));
      if (selectedImageModel.imageCapabilities) {
        const error = validateImageSettings(requestPayload, payload.referenceImages.length, selectedImageModel.imageCapabilities);
        if (error) throw new Error(error);
      }
      const fingerprint = await createRequestFingerprint(requestPayload);
      const idempotencyKey = data.generationRequest?.fingerprint === fingerprint
        ? data.generationRequest.idempotencyKey
        : crypto.randomUUID();
      updateNodeDataSilent(node.id, {
        generationRequest: { fingerprint, idempotencyKey },
      });
      trackBehavior('ip_generation_requested', { source: 'editor', node_type: 'generateImage', operation: 'generate_image' });
      const result = await requestGenerateImage(
        { ...requestPayload, idempotencyKey },
        {
          signal: controller.signal,
          onJobAccepted(jobId) {
            activeGenerationJobIdRef.current = jobId;
            setGenerationWaitPhase('queued');
            updateNodeDataSilent(node.id, {
              generationRequest: { fingerprint, idempotencyKey, jobId },
            });
          },
          onJobUpdate(job) {
            if (job.status === 'queued' || job.status === 'running') setGenerationWaitPhase(job.status);
          },
        },
      );
      const asset = result.asset;
      setGenerationWaitPhase('saving');
      addAsset(asset);
      updateNodeData(node.id, {
        ...appendGenerationResult(data, asset.id),
        resultMetadata: {
          ...data.resultMetadata,
          [asset.id]: {
            aspectRatio: selectedAspectRatio,
            model: selectedModel,
            size: selectedSize,
          },
        },
        model: selectedModel,
        aspectRatio: selectedAspectRatio,
        size: selectedSize,
        generationRequest: undefined,
        message: result.message,
      });
      setNodeStatus(node.id, 'success');
      notifyAssistantNotice({
        id: `image-generated:${asset.id}`,
        status: 'success',
        title: tUi("Изображение готово"),
        subtitle: tUi("Ровер закончил задачу. Открой чат, чтобы найти источник."),
        nodeId: node.id,
      });
      void recordDocumentAssistantActivity({
        documentId: scope.documentId,
        workspaceId: scope.workspaceId,
        kind: 'image-generated',
        model: selectedModel,
        assetId: asset.id,
        nodeId: node.id,
      }).catch(() => undefined);
    } catch (error) {
      if (controller.signal.aborted) return;
      setNodeStatus(node.id, 'error');
      if (shouldDiscardGenerationRequest(error)) {
        updateNodeDataSilent(node.id, { generationRequest: undefined });
      }
      updateNodeDataSilent(node.id, {
        message: error instanceof Error ? error.message : 'OpenRouter generation failed',
      });
    } finally {
      activeGenerationJobIdRef.current = null;
      if (pollingControllerRef.current === controller) {
        pollingControllerRef.current = null;
      }
    }
  };

  const handleMaskEdit = createGenerateImageMaskEditAction({
    addAsset,
    assets,
    data,
    nodeId: node.id,
    selectedAspectRatio,
    selectedSize,
    setNodeStatus,
    updateNodeData,
    updateNodeDataSilent,
  });

  return {
    allSectionsOpen,
    aspectRatioOptions: valueSelectOptions(aspectRatios),
    catalogAspectRatios: imageModels.flatMap((model) => model.aspectRatios ?? []),
    data,
    generationHistory,
    generationWaitPhase,
    handleGenerate,
    handleAspectRatioChange: (aspectRatio: string) => updateNodeData(node.id, { aspectRatio }),
    handleGenerationHistoryChange: (index: number) => updateNodeDataSilent(node.id, selectGenerationResult(data, index)),
    handleMaskEdit,
    handleModelChange,
    handlePromptChange: (prompt: string) => updateNodePrompt(node.id, prompt),
    handleSizeChange: (size: string) => updateNodeData(node.id, { size }),
    promptRows,
    legacyReferenceRows,
    getInputSummary: (portId: string) => getInputConnectionStatus(node.id, portId, { edges, nodes, assets }),
    loading,
    catalogError: catalog.imageCatalogError,
    modelUnavailable: !selectedImageModel,
    capabilities: selectedImageModel?.imageCapabilities,
    handleImageSettingsChange: (settings: Partial<ImageGenerationOptions>) => updateNodeData(node.id, settings),
    modelOptions: modelSelectOptions(selectedImageModel ? imageModels : [
      { id: selectedModel, label: tUi("{p1} (недоступна)", { p1: selectedModel }), name: selectedModel, inputModalities: [], outputModalities: [], supportedParameters: [] },
      ...imageModels,
    ]),
    promptOpen,
    promptState: getGenerateInputKinds(node.id, 'prompt', edges, nodes),
    referenceState: getGenerateInputKinds(node.id, 'reference', edges, nodes),
    selectedAspectRatio,
    selectedModel,
    selectedSize,
    setPromptOpen,
    setSettingsOpen,
    settingsOpen,
    resultOpen,
    setResultOpen,
    sizeOptions: valueSelectOptions(sizes),
    toggleAllSections,
    getInputState: (portId: string) => getGenerateInputKinds(node.id, portId, edges, nodes),
  };
}
