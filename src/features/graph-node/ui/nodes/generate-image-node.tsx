'use client';

import { Loader2, Sparkles } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useMemo } from 'react';
import type { GenerateImageNodeData, ProductionNode } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { DEFAULT_IMAGE_MODEL, MODEL_FALLBACK_ASPECT_RATIOS, MODEL_FALLBACK_SIZES } from '@/shared/api/openrouter-models';
import { useOpenRouterModels } from '@/shared/api/use-openrouter-models';
import { saveImageAsset } from '@/shared/lib/asset-db';
import { dataUrlToFile } from '@/shared/lib/image-data-url';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { PromptBox } from '@/shared/ui/prompt-box';
import { SettingRow } from '@/shared/ui/setting-row';
import {
  buildGeneratePayload,
  formatApiError,
  generateInputRows,
  getGenerateInputSummary,
} from '../../lib/generate-node-inputs';
import { getSelectedModelId, modelSelectOptions, valueSelectOptions } from '../../lib/node-select-options';
import { ImagePlate } from '../image-plate';
import { NodeTitle } from '../node-title';
import { PortButton } from '../port-button';

interface GenerateImageNodeProps {
  node: ProductionNode;
  composingOpen: boolean;
  onComposingOpenChange: (open: boolean) => void;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
}

export function GenerateImageNode({
  node,
  composingOpen,
  onComposingOpenChange,
  onStartConnection,
}: GenerateImageNodeProps) {
  const data = node.data as GenerateImageNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const assets = useProductionGraphStore((state) => state.assets);
  const addAsset = useProductionGraphStore((state) => state.addAsset);
  const assignAssetToNode = useProductionGraphStore((state) => state.assignAssetToNode);
  const setNodeStatus = useProductionGraphStore((state) => state.setNodeStatus);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodePrompt = useProductionGraphStore((state) => state.updateNodePrompt);
  const { imageModels, loading } = useOpenRouterModels();
  const modelOptions = modelSelectOptions(imageModels);
  const selectedModel = getSelectedModelId(imageModels, data.model, DEFAULT_IMAGE_MODEL);
  const selectedImageModel = imageModels.find((model) => model.id === selectedModel);
  const aspectRatios = selectedImageModel?.aspectRatios?.length ? selectedImageModel.aspectRatios : MODEL_FALLBACK_ASPECT_RATIOS;
  const sizes = selectedImageModel?.sizes?.length ? selectedImageModel.sizes : MODEL_FALLBACK_SIZES;
  const selectedAspectRatio = aspectRatios.includes(data.aspectRatio) ? data.aspectRatio : aspectRatios[0];
  const selectedSize = sizes.includes(data.size) ? data.size : sizes[0];
  const inputSummary = useMemo(() => getGenerateInputSummary(node.id, edges, nodes), [edges, node.id, nodes]);

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
    try {
      setNodeStatus(node.id, 'running');
      const payload = await buildGeneratePayload(node.id, edges, nodes, assets);
      const response = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, model: selectedModel, aspectRatio: selectedAspectRatio, size: selectedSize, prompt: data.prompt ?? '' }),
      });
      const result = await response.json() as { imageDataUrl?: string | null; message?: string; error?: unknown };
      if (!response.ok) throw new Error(formatApiError(result.error));
      if (!result.imageDataUrl) throw new Error(result.message || 'OpenRouter не вернул изображение.');

      const file = await dataUrlToFile(result.imageDataUrl, `generated-${Date.now()}.png`);
      const asset = await saveImageAsset(file);
      addAsset(asset);
      assignAssetToNode(node.id, asset.id);
      updateNodeData(node.id, { model: selectedModel, aspectRatio: selectedAspectRatio, size: selectedSize, message: result.message });
      setNodeStatus(node.id, 'success');
    } catch (error) {
      setNodeStatus(node.id, 'error');
      window.alert(error instanceof Error ? error.message : 'OpenRouter generation failed');
    }
  };

  return (
    <>
      <NodeTitle title="Generate Image" muted />
      <ImagePlate assetId={data.resultAssetId} loading={node.status === 'running'} />
      <button type="button" className="primary-node-button" onClick={handleGenerate} disabled={node.status === 'running' || loading}>
        {node.status === 'running' ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}
        Generate
      </button>
      <div className="node-block">
        <div className="node-label">Prompt</div>
        <PromptBox value={data.prompt} onChange={(value) => updateNodePrompt(node.id, value)} />
      </div>
      <CollapsibleSection title="Settings">
        <SettingRow label="Model" value={selectedModel} options={modelOptions} onChange={handleModelChange} wide />
        <SettingRow label="Aspect Ratio" value={selectedAspectRatio} options={valueSelectOptions(aspectRatios)} onChange={(aspectRatio) => updateNodeData(node.id, { aspectRatio })} />
        <SettingRow label="Size" value={selectedSize} options={valueSelectOptions(sizes)} onChange={(size) => updateNodeData(node.id, { size })} />
      </CollapsibleSection>
      <CollapsibleSection
        title="Composing"
        className="generate-composing-section"
        open={composingOpen}
        onOpenChange={onComposingOpenChange}
        sidePort={!composingOpen ? <PortButton nodeId={node.id} portId="composing" side="input" kind="reference" label="Composing" className="node-port-section" onStartConnection={onStartConnection} /> : null}
      >
        {generateInputRows.map((row) => (
          <div className="setting-row composing-row" key={row.id}>
            <PortButton nodeId={node.id} portId={row.id} side="input" kind="reference" label={row.label} className="node-port-row" onStartConnection={onStartConnection} />
            <span>{row.label}</span>
            <span className="input-pill">{inputSummary[row.id]}</span>
          </div>
        ))}
      </CollapsibleSection>
      {data.message ? <div className="node-note node-note-compact">{data.message}</div> : null}
    </>
  );
}
