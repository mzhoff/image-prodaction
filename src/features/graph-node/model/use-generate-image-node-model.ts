'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { appendGenerationResult, getGenerationHistory, selectGenerationResult } from '@/entities/production-graph/model/generation-history';
import type { GenerateImageNodeData, ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import {
  AiRequestError,
  requestEditImage,
  requestGenerateImage,
  requestGenerationJob,
} from '@/shared/api/ai-client';
import { DEFAULT_IMAGE_MODEL, MODEL_FALLBACK_ASPECT_RATIOS, MODEL_FALLBACK_SIZES } from '@/shared/api/openrouter-models';
import { useOpenRouterModels } from '@/shared/api/use-openrouter-models';
import { loadAssetBlob, saveTransientImageAsset } from '@/entities/production-graph/lib/asset-db';
import { getActiveAssetScope } from '@/entities/production-graph/lib/remote-asset';
import { blobToDataUrl, dataUrlToFile } from '@/shared/lib/image-data-url';
import { createRequestFingerprint } from '@/shared/lib/request-fingerprint';
import {
  buildGeneratePayload,
  getGenerateInputKinds,
  getGenerateInputSummary,
} from '../lib/generate-node-inputs';
import { getSelectedModelId, modelSelectOptions, valueSelectOptions } from '../lib/node-select-options';

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
  const data = node.data as GenerateImageNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const assets = useProductionGraphStore((state) => state.assets);
  const addAsset = useProductionGraphStore((state) => state.addAsset);
  const setNodeStatus = useProductionGraphStore((state) => state.setNodeStatus);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodeDataSilent = useProductionGraphStore((state) => state.updateNodeDataSilent);
  const updateNodePrompt = useProductionGraphStore((state) => state.updateNodePrompt);
  const { imageModels, loading } = useOpenRouterModels();
  const selectedModel = getSelectedModelId(imageModels, data.model, DEFAULT_IMAGE_MODEL);
  const selectedImageModel = imageModels.find((model) => model.id === selectedModel);
  const aspectRatios = selectedImageModel?.aspectRatios?.length ? selectedImageModel.aspectRatios : MODEL_FALLBACK_ASPECT_RATIOS;
  const sizes = selectedImageModel?.sizes?.length ? selectedImageModel.sizes : MODEL_FALLBACK_SIZES;
  const selectedAspectRatio = aspectRatios.includes(data.aspectRatio) ? data.aspectRatio : aspectRatios[0];
  const selectedSize = sizes.includes(data.size) ? data.size : sizes[0];
  const inputSummary = useMemo(() => getGenerateInputSummary(node.id, edges, nodes), [edges, node.id, nodes]);
  const generationHistory = useMemo(() => getGenerationHistory(data), [data]);
  const [promptOpen, setPromptOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(true);
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
  const allSectionsOpen = promptOpen && settingsOpen && composingOpen;

  useEffect(() => () => {
    pollingControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    const jobId = pendingGenerationJobId;
    if (!jobId || activeGenerationJobIdRef.current === jobId) return;
    const controller = new AbortController();
    pollingControllerRef.current?.abort();
    pollingControllerRef.current = controller;
    activeGenerationJobIdRef.current = jobId;
    setNodeStatus(node.id, 'running');
    updateNodeDataSilent(node.id, {
      message: 'Восстанавливаем незавершённую генерацию…',
    });
    void requestGenerationJob(jobId, { signal: controller.signal }).then((result) => {
      const current = generationPresentationRef.current;
      const asset = result.asset;
      addAsset(asset);
      updateNodeData(node.id, {
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
      setNodeStatus(node.id, 'success');
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setNodeStatus(node.id, 'error');
      if (shouldDiscardGenerationRequest(error)) {
        updateNodeDataSilent(node.id, { generationRequest: undefined });
      }
      updateNodeDataSilent(node.id, {
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
    addAsset,
    node.id,
    pendingGenerationJobId,
    setNodeStatus,
    updateNodeData,
    updateNodeDataSilent,
  ]);

  const toggleAllSections = () => {
    const nextOpen = !allSectionsOpen;
    setPromptOpen(nextOpen);
    setSettingsOpen(nextOpen);
    onComposingOpenChange(nextOpen);
  };

  const handleModelChange = (model: string) => {
    const nextModel = imageModels.find((item) => item.id === model);
    const nextAspectRatios = nextModel?.aspectRatios?.length ? nextModel.aspectRatios : MODEL_FALLBACK_ASPECT_RATIOS;
    const nextSizes = nextModel?.sizes?.length ? nextModel.sizes : MODEL_FALLBACK_SIZES;
    updateNodeData(node.id, {
      model,
      aspectRatio: nextAspectRatios.includes(data.aspectRatio) ? data.aspectRatio : nextAspectRatios[0],
      size: nextSizes.includes(data.size) ? data.size : nextSizes[0],
    });
  };

  const handleGenerate = async () => {
    const controller = new AbortController();
    pollingControllerRef.current?.abort();
    pollingControllerRef.current = controller;
    try {
      setNodeStatus(node.id, 'running');
      updateNodeDataSilent(node.id, { message: '' });
      const payload = await buildGeneratePayload(node.id, edges, nodes, assets);
      const prompt = [...payload.promptInputs, data.prompt ?? ''].filter((item) => item.trim()).join('\n\n');
      const scope = getActiveAssetScope();
      if (!scope) throw new Error('Document generation storage is not ready. Reload the document and try again.');
      const requestPayload = {
        ...payload,
        ...scope,
        model: selectedModel,
        aspectRatio: selectedAspectRatio,
        size: selectedSize,
        prompt,
      };
      const fingerprint = await createRequestFingerprint(requestPayload);
      const idempotencyKey = data.generationRequest?.fingerprint === fingerprint
        ? data.generationRequest.idempotencyKey
        : crypto.randomUUID();
      updateNodeDataSilent(node.id, {
        generationRequest: { fingerprint, idempotencyKey },
      });
      const result = await requestGenerateImage(
        { ...requestPayload, idempotencyKey },
        {
          signal: controller.signal,
          onJobAccepted(jobId) {
            activeGenerationJobIdRef.current = jobId;
            updateNodeDataSilent(node.id, {
              generationRequest: { fingerprint, idempotencyKey, jobId },
            });
          },
        },
      );
      const asset = result.asset;
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

  const handleMaskEdit = async ({ assetId, maskDataUrl, model, prompt }: { assetId: string; maskDataUrl: string; model: string; prompt: string }) => {
    try {
      setNodeStatus(node.id, 'running');
      const sourceAsset = assets.find((asset) => asset.id === assetId);
      if (!sourceAsset) throw new Error('Активное изображение не найдено в локальном графе.');
      const sourceBlob = await loadAssetBlob(sourceAsset);
      if (!sourceBlob) throw new Error('Не удалось прочитать активное изображение из локального хранилища.');

      const scope = getActiveAssetScope();
      if (!scope) throw new Error('Document generation storage is not ready. Reload the document and try again.');
      const requestPayload = {
        ...scope,
        aspectRatio: selectedAspectRatio,
        imageDataUrl: await blobToDataUrl(sourceBlob),
        maskDataUrl,
        model,
        prompt,
        size: selectedSize,
      };
      const fingerprint = await createRequestFingerprint(requestPayload);
      const idempotencyKey = data.editGenerationRequest?.fingerprint === fingerprint
        ? data.editGenerationRequest.idempotencyKey
        : crypto.randomUUID();
      updateNodeDataSilent(node.id, {
        editGenerationRequest: { fingerprint, idempotencyKey },
      });
      const result = await requestEditImage({ ...requestPayload, idempotencyKey });
      const file = await dataUrlToFile(result.imageDataUrl, `edited-${Date.now()}.png`);
      const editedAsset = await saveTransientImageAsset(file);
      addAsset(editedAsset);
      updateNodeData(node.id, {
        ...appendGenerationResult(data, editedAsset.id),
        resultMetadata: {
          ...data.resultMetadata,
          [editedAsset.id]: {
            aspectRatio: selectedAspectRatio,
            model,
            size: selectedSize,
          },
        },
        editGenerationRequest: undefined,
        message: result.message,
      });
      setNodeStatus(node.id, 'success');
    } catch (error) {
      setNodeStatus(node.id, 'error');
      if (shouldDiscardGenerationRequest(error)) {
        updateNodeDataSilent(node.id, { editGenerationRequest: undefined });
      }
      throw error;
    }
  };

  return {
    allSectionsOpen,
    aspectRatioOptions: valueSelectOptions(aspectRatios),
    data,
    generationHistory,
    handleGenerate,
    handleAspectRatioChange: (aspectRatio: string) => updateNodeData(node.id, { aspectRatio }),
    handleGenerationHistoryChange: (index: number) => updateNodeDataSilent(node.id, selectGenerationResult(data, index)),
    handleMaskEdit,
    handleModelChange,
    handlePromptChange: (prompt: string) => updateNodePrompt(node.id, prompt),
    handleSizeChange: (size: string) => updateNodeData(node.id, { size }),
    inputSummary,
    loading,
    modelOptions: modelSelectOptions(imageModels),
    promptOpen,
    promptState: getGenerateInputKinds(node.id, 'prompt', edges, nodes),
    referenceState: getGenerateInputKinds(node.id, 'reference', edges, nodes),
    selectedAspectRatio,
    selectedModel,
    selectedSize,
    setPromptOpen,
    setSettingsOpen,
    settingsOpen,
    sizeOptions: valueSelectOptions(sizes),
    toggleAllSections,
    getInputState: (portId: string) => getGenerateInputKinds(node.id, portId, edges, nodes),
  };
}

function shouldDiscardGenerationRequest(error: unknown) {
  return error instanceof AiRequestError
    && error.code !== 'generation_in_progress'
    && error.status < 500;
}
