'use client';

import { Loader2, Sparkles } from 'lucide-react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { PrimaryActionButton } from '@/shared/ui/primary-action-button';
import { PromptBox } from '@/shared/ui/prompt-box';
import { SettingRow } from '@/shared/ui/setting-row';
import {
  refineModeOptions,
  refinePreserveStrengthOptions,
  useRefineImageNodeModel,
} from '../../model/use-refine-image-node-model';
import { ImagePlate } from '../image-plate';
import { NodeTitle } from '../node-title';

export function RefineImageNode({ node }: { node: ProductionNode }) {
  const model = useRefineImageNodeModel(node);
  const displayAssetId = model.generationHistory.activeAssetId ?? model.sourceAsset?.id;

  return (
    <>
      <NodeTitle title={node.data.title} nodeType={node.type} muted />
      <ImagePlate
        activeIndex={model.generationHistory.activeIndex}
        assetId={displayAssetId}
        assetIds={model.generationHistory.assetIds}
        assetMetadata={model.data.resultMetadata}
        loading={node.status === 'running'}
        onActiveIndexChange={model.handleResultHistoryChange}
        sourceModel={model.selectedModel}
      />
      <RefineImageMeta
        aspectRatio={model.selectedAspectRatio}
        outputSize={model.outputSizeLabel}
        sourceSize={model.sourceSizeLabel}
      />
      <PrimaryActionButton
        icon={model.processing ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}
        onClick={model.handleRefine}
        disabled={!model.sourceAsset || model.processing || model.loading}
      >
        Refine
      </PrimaryActionButton>
      <CollapsibleSection title="Settings">
        <SettingRow label="Mode" value={model.data.mode} options={refineModeOptions} onChange={model.handleModeChange} wide />
        <SettingRow label="Preserve" value={model.data.preserveStrength} options={refinePreserveStrengthOptions} onChange={model.handlePreserveStrengthChange} />
        <SettingRow label="Model" value={model.selectedModel} options={model.modelOptions} onChange={model.handleModelChange} wide />
        <SettingRow label="Size" value={model.selectedSize} options={model.sizeOptions} onChange={model.handleSizeChange} />
      </CollapsibleSection>
      <CollapsibleSection title="Instruction">
        <PromptBox value={model.data.instruction} onChange={model.handleInstructionChange} />
      </CollapsibleSection>
      <div className="node-note node-note-compact">
        OpenRouter refine is generative: it improves reference quality but can redraw details.
      </div>
      {model.data.message ? <div className="node-note node-note-compact">{model.data.message}</div> : null}
    </>
  );
}

function RefineImageMeta({
  aspectRatio,
  outputSize,
  sourceSize,
}: {
  aspectRatio: string;
  outputSize?: string;
  sourceSize?: string;
}) {
  return (
    <div className="refine-image-meta">
      <span>Aspect {aspectRatio}</span>
      {sourceSize ? <span>Input {sourceSize}</span> : null}
      {outputSize ? <strong>Output {outputSize}</strong> : null}
    </div>
  );
}
