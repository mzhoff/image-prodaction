'use client';

import { Loader2, Play } from 'lucide-react';
import type { ExtractPresetId, ImageToTextNodeData, ProductionNode } from '@/entities/production-graph/model/types';
import { extractPresets, getExtractPreset } from '@/entities/production-graph/model/extract-presets';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { DEFAULT_ANALYSIS_MODEL } from '@/shared/api/openrouter-models';
import { useOpenRouterModels } from '@/shared/api/use-openrouter-models';
import { loadAssetBlob } from '@/shared/lib/asset-db';
import { prepareImageForOpenRouter } from '@/shared/lib/image-data-url';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { PromptBox } from '@/shared/ui/prompt-box';
import { SettingRow } from '@/shared/ui/setting-row';
import { findIncomingImageAsset, formatApiError } from '../../lib/generate-node-inputs';
import { getSelectedModelId, modelSelectOptions } from '../../lib/node-select-options';
import { NodeTitle } from '../node-title';

export function ImageToTextNode({ node }: { node: ProductionNode }) {
  const data = node.data as ImageToTextNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const assets = useProductionGraphStore((state) => state.assets);
  const setNodeStatus = useProductionGraphStore((state) => state.setNodeStatus);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodePrompt = useProductionGraphStore((state) => state.updateNodePrompt);
  const updateNodeResult = useProductionGraphStore((state) => state.updateNodeResult);
  const { analysisModels, loading } = useOpenRouterModels();
  const modelOptions = modelSelectOptions(analysisModels);
  const selectedModel = getSelectedModelId(analysisModels, data.model, DEFAULT_ANALYSIS_MODEL);
  const selectedPreset = getExtractPreset(data.preset);

  const handleAnalyze = async () => {
    const sourceAsset = findIncomingImageAsset(node.id, 'image', edges, nodes, assets);
    if (!sourceAsset) {
      window.alert('Подключи изображение к входу Extract или загрузи его в Import node.');
      return;
    }
    if (!data.prompt?.trim()) {
      window.alert('Выбери preset или введи prompt для Extract.');
      return;
    }

    try {
      setNodeStatus(node.id, 'running');
      const blob = await loadAssetBlob(sourceAsset);
      if (!blob) throw new Error('Не удалось прочитать загруженное изображение.');

      const imageDataUrl = await prepareImageForOpenRouter(blob);
      const response = await fetch('/api/ai/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel, prompt: data.prompt, imageDataUrl }),
      });
      const result = await response.json() as { text?: string; error?: unknown };
      if (!response.ok) throw new Error(formatApiError(result.error));

      updateNodeData(node.id, { model: selectedModel, result: result.text ?? '' });
      setNodeStatus(node.id, 'success');
    } catch (error) {
      setNodeStatus(node.id, 'error');
      window.alert(error instanceof Error ? error.message : 'OpenRouter analysis failed');
    }
  };

  return (
    <>
      <NodeTitle title="Extract" muted />
      <CollapsibleSection title="Settings">
        <SettingRow
          label="Preset"
          value={selectedPreset.id}
          options={extractPresets.map((preset) => ({ value: preset.id, label: preset.label }))}
          onChange={(presetId) => {
            const preset = getExtractPreset(presetId as ExtractPresetId);
            updateNodeData(node.id, { preset: preset.id, prompt: preset.prompt });
          }}
          wide
        />
        <SettingRow label="Model" value={selectedModel} options={modelOptions} onChange={(model) => updateNodeData(node.id, { model })} wide />
      </CollapsibleSection>
      <div className="node-block">
        <div className="node-label">Prompt</div>
        <PromptBox value={data.prompt} onChange={(value) => updateNodePrompt(node.id, value)} />
      </div>
      <button type="button" className="secondary-node-button" onClick={handleAnalyze} disabled={node.status === 'running' || loading}>
        {node.status === 'running' ? <Loader2 className="spin" size={15} /> : <Play size={15} />}
        Analyze
      </button>
      <div className="node-block">
        <div className="node-label">Result</div>
        <PromptBox value={data.result} onChange={(value) => updateNodeResult(node.id, value)} />
      </div>
    </>
  );
}
