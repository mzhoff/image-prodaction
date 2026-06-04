'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AssetRecord, GenerationResultMetadata } from '@/entities/production-graph/model/types';
import { DEFAULT_IMAGE_MODEL, PREFERRED_IMAGE_MODEL_IDS, getImageModelConfig } from '@/shared/api/openrouter-models';
import { useOpenRouterModels } from '@/shared/api/use-openrouter-models';
import { modelSelectOptions } from '../lib/node-select-options';
import type { ImageMaskEditorHandle, MaskTool } from './image-mask-editor';
import type { MaskEditPayload } from './image-viewer-types';

export const MIN_MASK_BRUSH_SIZE = 8;
export const MAX_MASK_BRUSH_SIZE = 120;

interface UseImageViewerMaskModelParams {
  asset?: AssetRecord;
  assetId?: string;
  assetMetadata?: Record<string, GenerationResultMetadata>;
  maskDataUrl?: string;
  onMaskChange?: (maskDataUrl: string | null) => void;
  onMaskEdit?: (payload: MaskEditPayload) => Promise<void>;
  sourceModel?: string;
}

export function useImageViewerMaskModel({
  asset,
  assetId,
  assetMetadata,
  maskDataUrl,
  onMaskChange,
  onMaskEdit,
  sourceModel,
}: UseImageViewerMaskModelParams) {
  const canMaskEdit = Boolean(assetId && (onMaskEdit || onMaskChange));
  const localMaskMode = Boolean(onMaskChange && !onMaskEdit);
  const activeMetadata = assetId ? assetMetadata?.[assetId] : undefined;
  const sourceModelId = activeMetadata?.model ?? sourceModel;
  const editDefaultModel = sourceModelId && PREFERRED_IMAGE_MODEL_IDS.includes(sourceModelId)
    ? sourceModelId
    : DEFAULT_IMAGE_MODEL;
  const [brushSize, setBrushSize] = useState(16);
  const [editModel, setEditModel] = useState(editDefaultModel);
  const [maskOpen, setMaskOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [previewTool, setPreviewTool] = useState<MaskTool | null>(null);
  const [prompt, setPrompt] = useState('');
  const [tool, setTool] = useState<MaskTool>('brush');
  const maskRef = useRef<ImageMaskEditorHandle | null>(null);
  const { imageModels } = useOpenRouterModels();
  const visibleTool = previewTool ?? tool;

  const modelOptions = useMemo(() => {
    const options = modelSelectOptions(imageModels);
    for (const modelId of [editDefaultModel, editModel]) {
      if (!modelId || options.some((option) => option.value === modelId)) continue;
      options.push({ value: modelId, label: getImageModelConfig(modelId).label });
    }
    return options;
  }, [editDefaultModel, editModel, imageModels]);

  const selectedEditModel = modelOptions.some((option) => option.value === editModel) ? editModel : editDefaultModel;
  const sourceModelLabel = sourceModelId ? getImageModelLabel(sourceModelId, imageModels) : undefined;
  const imageSizeLabel = asset?.width && asset.height ? `${asset.width} × ${asset.height}px` : undefined;

  useEffect(() => {
    if (!maskOpen) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('textarea,input,select,[contenteditable="true"]')) return;
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;

      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) {
        maskRef.current?.redo();
      } else {
        maskRef.current?.undo();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [maskOpen]);

  useEffect(() => {
    if (!localMaskMode) {
      maskRef.current?.reset();
    }
    setMessage('');
  }, [assetId, localMaskMode]);

  useEffect(() => {
    setEditModel(editDefaultModel);
  }, [assetId, editDefaultModel]);

  useEffect(() => {
    if (!maskOpen) setPreviewTool(null);
  }, [maskOpen]);

  const handleSubmitEdit = async () => {
    if (!assetId || !onMaskEdit) return;
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setMessage('Опиши, что нужно изменить в выделенной области.');
      return;
    }
    const maskDataUrl = maskRef.current?.getMaskDataUrl();
    if (!maskDataUrl) {
      setMessage('Сначала нарисуй маску на изображении.');
      return;
    }

    setMessage('');
    try {
      await onMaskEdit({ assetId, maskDataUrl, model: selectedEditModel, prompt: trimmedPrompt });
      maskRef.current?.reset();
      setMaskOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось перегенерировать фрагмент.');
    }
  };

  return {
    brushSize,
    canMaskEdit,
    handleSubmitEdit,
    localMaskMode,
    imageSizeLabel,
    maskDataUrl,
    maskOpen,
    maskRef,
    message,
    onMaskChange,
    modelOptions,
    prompt,
    selectedEditModel,
    setBrushSize,
    setEditModel,
    setMaskOpen,
    setPreviewTool,
    setPrompt,
    setTool,
    sourceModelLabel,
    tool,
    visibleTool,
  };
}

function getImageModelLabel(modelId: string, imageModels: Array<{ id: string; label: string }>) {
  return imageModels.find((model) => model.id === modelId)?.label ?? getImageModelConfig(modelId).label;
}
