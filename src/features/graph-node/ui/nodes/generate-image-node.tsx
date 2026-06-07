'use client';

import { Loader2, Maximize2, Minimize2, Sparkles } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { PromptBox } from '@/shared/ui/prompt-box';
import { PrimaryActionButton } from '@/shared/ui/primary-action-button';
import { SettingRow } from '@/shared/ui/setting-row';
import { useGenerateImageNodeModel } from '../../model/use-generate-image-node-model';
import { generateReferenceRows } from '../../lib/generate-node-inputs';
import { ImagePlate } from '../image-plate';
import { NodeTitle, NodeTitleActions, NodeTitleOptionsButton } from '../node-title';
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
  const model = useGenerateImageNodeModel({ node, composingOpen, onComposingOpenChange });

  return (
    <>
      <NodeTitle
        title="Generate Image"
        nodeType={node.type}
        muted
        action={(
          <NodeTitleActions>
            <button
              type="button"
              className="node-title-action"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                model.toggleAllSections();
              }}
              aria-label={model.allSectionsOpen ? 'Collapse all sections' : 'Expand all sections'}
            >
              {model.allSectionsOpen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <NodeTitleOptionsButton />
          </NodeTitleActions>
        )}
      />
      <ImagePlate
        activeIndex={model.generationHistory.activeIndex}
        assetId={model.generationHistory.activeAssetId}
        assetIds={model.generationHistory.assetIds}
        assetMetadata={model.data.resultMetadata}
        aspectRatio={model.selectedAspectRatio}
        loading={node.status === 'running'}
        onActiveIndexChange={model.handleGenerationHistoryChange}
        onMaskEdit={model.handleMaskEdit}
        sourceModel={model.data.model}
      />
      <PrimaryActionButton
        icon={node.status === 'running' ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}
        onClick={model.handleGenerate}
        disabled={node.status === 'running' || model.loading}
      >
        Generate
      </PrimaryActionButton>
      <CollapsibleSection
        title="Prompt"
        open={model.promptOpen}
        onOpenChange={model.setPromptOpen}
        dropTarget={{ nodeId: node.id, portId: 'prompt' }}
        sidePort={<PortButton nodeId={node.id} portId="prompt" side="input" kind="text" label="Prompt" connectionState={model.promptState} className="node-port-section" onStartConnection={onStartConnection} />}
      >
        <PromptBox value={model.data.prompt} onChange={model.handlePromptChange} />
      </CollapsibleSection>
      <CollapsibleSection title="Settings" open={model.settingsOpen} onOpenChange={model.setSettingsOpen}>
        <SettingRow label="Model" value={model.selectedModel} options={model.modelOptions} onChange={model.handleModelChange} wide />
        <SettingRow label="Aspect Ratio" value={model.selectedAspectRatio} options={model.aspectRatioOptions} onChange={model.handleAspectRatioChange} />
        <SettingRow label="Size" value={model.selectedSize} options={model.sizeOptions} onChange={model.handleSizeChange} />
      </CollapsibleSection>
      <CollapsibleSection
        title="Reference"
        className="generate-composing-section"
        open={composingOpen}
        onOpenChange={onComposingOpenChange}
        dropTarget={{ nodeId: node.id, portId: 'reference' }}
        sidePort={<PortButton nodeId={node.id} portId="reference" side="input" kind="image" label="Reference" connectionState={model.referenceState} className="node-port-section" onStartConnection={onStartConnection} />}
      >
        {generateReferenceRows.map((row) => {
          const state = model.getInputState(row.id);
          return (
          <div
            className={`setting-row composing-row ${state !== 'empty' ? 'composing-row-connected' : ''}`}
            data-port-node-id={node.id}
            data-port-id={row.id}
            data-port-side="input"
            data-connect-row="true"
            key={row.id}
          >
            <PortButton nodeId={node.id} portId={row.id} side="input" kind="reference" label={row.label} connectionState={state} className="node-port-row" onStartConnection={onStartConnection} />
            <span>{row.label}</span>
            <span className={`input-pill ${state === 'empty' ? 'input-pill-empty' : 'input-pill-connected'}`}>{model.inputSummary[row.id]}</span>
          </div>
          );
        })}
      </CollapsibleSection>
      {model.data.message ? <div className="node-note node-note-compact">{model.data.message}</div> : null}
    </>
  );
}
