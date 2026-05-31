'use client';

import { ChevronDown, Sparkles } from 'lucide-react';
import { DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO } from '@/entities/production-graph/model/node-layout';
import type { ProductionNode, ReferenceComposerNodeData } from '@/entities/production-graph/model/types';
import { MODEL_FALLBACK_ASPECT_RATIOS, MODEL_FALLBACK_SIZES } from '@/shared/api/openrouter-models';
import { useOpenRouterModels } from '@/shared/api/use-openrouter-models';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { PromptBox } from '@/shared/ui/prompt-box';
import { SettingRow } from '@/shared/ui/setting-row';
import { modelSelectOptions, valueSelectOptions } from '../../lib/node-select-options';
import { ImagePlate } from '../image-plate';
import { NodeTitle } from '../node-title';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';

export function ReferenceComposerNode({ node }: { node: ProductionNode }) {
  const data = node.data as ReferenceComposerNodeData;
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const { imageModels } = useOpenRouterModels();
  const prompt = data.composedPrompt || data.prompt;
  const modelOptions = modelSelectOptions(imageModels);

  return (
    <>
      <NodeTitle title={data.title} muted />
      <ImagePlate compact />
      <CollapsibleSection title="Settings">
        <SettingRow
          label="Model"
          value={data.model ?? 'google/gemini-2.5-flash-image'}
          options={modelOptions}
          onChange={(model) => updateNodeData(node.id, { model })}
          wide
        />
        <SettingRow
          label="Aspect Ratio"
          value={data.aspectRatio ?? DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO}
          options={valueSelectOptions(MODEL_FALLBACK_ASPECT_RATIOS)}
          onChange={(aspectRatio) => updateNodeData(node.id, { aspectRatio })}
        />
        <SettingRow
          label="Size"
          value={data.size ?? '1K'}
          options={valueSelectOptions(MODEL_FALLBACK_SIZES)}
          onChange={(size) => updateNodeData(node.id, { size })}
        />
      </CollapsibleSection>
      <CollapsibleSection title="Composing">
        {data.slots.map((slot) => (
          <div className="setting-row" key={slot.id}>
            <span>{slot.label}</span>
            <button type="button" className="mini-select mini-select-wide">
              {slot.value || 'Add prompt'}
              <ChevronDown size={13} />
            </button>
          </div>
        ))}
      </CollapsibleSection>
      <div className="node-block">
        <div className="node-label">Prompt</div>
        <PromptBox value={prompt} readonly />
      </div>
      <button type="button" className="primary-node-button">
        <Sparkles size={17} />
        Generate
      </button>
    </>
  );
}
