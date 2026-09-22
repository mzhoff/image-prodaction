'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Loader2, Maximize2, Minimize2, Sparkles } from '@prodactionpro/ui-core/icons';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { FragmentPromptBox as PromptBox } from '../fragment-prompt-box';
import { PrimaryActionButton } from '@/shared/ui/primary-action-button';
import { ModelSettingRow } from '@/features/model-selector/ui/model-selector';
import { SettingRow } from '@/shared/ui/setting-row';
import { useGenerateImageNodeModel } from '../../model/use-generate-image-node-model';

import { ImagePlate } from '../image-plate';
import { NodeTitle, NodeTitleActions, NodeTitleOptionsButton } from '../node-title';
import { PortButton } from '../port-button';
import { GenerationWaitingExperience } from '@/features/generation-waiting/ui/generation-waiting-experience';
import { InputConnectionBadge } from '../input-connection-badge';
import { ImageModelLogo } from '../image-model-logo';
import { ImageGenerationSettings } from '../image-generation-settings';
import { AspectRatioSelector } from '@/features/aspect-ratio-selector/ui/aspect-ratio-selector';
import { getImageOutputResolution } from '@/shared/media/output-resolution/image-output-resolution';

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
  const tUi = useTranslations();
  const model = useGenerateImageNodeModel({ node, composingOpen, onComposingOpenChange });

  return (
    <>
      <NodeTitle
        title={model.data.title}
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
      <CollapsibleSection
        title="Prompt"
        open={model.promptOpen}
        onOpenChange={model.setPromptOpen}
        dropTarget={{ nodeId: node.id, portId: 'prompt' }}
        sidePort={<PortButton nodeId={node.id} portId="prompt" side="input" kind="text" label="Prompt" connectionState={model.promptState} className="node-port-section" onStartConnection={onStartConnection} />}
      >
        <PromptBox textField="prompt" value={model.data.prompt} onChange={model.handlePromptChange} />
        {model.promptRows.map((row) => {
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
            <PortButton nodeId={node.id} portId={row.id} side="input" kind={row.kind} label={row.label} connectionState={state} className="node-port-row" onStartConnection={onStartConnection} />
            <span>{row.label}</span>
            <InputConnectionBadge status={model.getInputSummary(row.id)} />
          </div>
          );
        })}

      </CollapsibleSection>
      <CollapsibleSection
        title="Reference"
        className="generate-composing-section"
        open={composingOpen}
        onOpenChange={onComposingOpenChange}
        dropTarget={{ nodeId: node.id, portId: 'reference' }}
        sidePort={<PortButton nodeId={node.id} portId="reference" side="input" kind="image" label="Reference" connectionState={model.referenceState} className="node-port-section" onStartConnection={onStartConnection} />}
      >
        <div className="generate-reference-badges"><InputConnectionBadge status={model.getInputSummary('reference')} /></div>
        {model.legacyReferenceRows.map((row) => (
          <div className="setting-row composing-row" data-port-node-id={node.id} data-port-id={row.id} data-port-side="input" data-connect-row="true" key={row.id}>
            <PortButton nodeId={node.id} portId={row.id} side="input" kind="reference" label={row.label} className="node-port-row" onStartConnection={onStartConnection} />
            <span>{row.label}</span><InputConnectionBadge status={model.getInputSummary(row.id)} />
          </div>
        ))}
      </CollapsibleSection>
      <CollapsibleSection title="Settings" open={model.settingsOpen} onOpenChange={model.setSettingsOpen}>
        <ModelSettingRow modality="image" label="Model" ariaLabel="Image model" value={model.selectedModel}
          options={model.modelOptions.map((option) => ({ ...option, icon: <ImageModelLogo modelId={option.value} /> }))}
          onChange={model.handleModelChange} wide />
        {(!model.capabilities || model.capabilities.parameters.aspect_ratio) && <AspectRatioSelector key={model.selectedModel}
          value={model.selectedAspectRatio} availableRatios={model.aspectRatioOptions.map((option) => option.value)}
          catalogRatios={model.catalogAspectRatios} onChange={model.handleAspectRatioChange}
          disabled={node.locked || node.status === 'running' || model.loading || model.modelUnavailable}
          getResolution={(ratio) => getImageOutputResolution(model.selectedModel, ratio, model.selectedSize)} />}
        {(!model.capabilities || model.capabilities.parameters.resolution) && <SettingRow label="Size" value={model.selectedSize} options={model.sizeOptions} onChange={model.handleSizeChange} />}
        {model.capabilities && <ImageGenerationSettings capabilities={model.capabilities} value={model.data} onChange={model.handleImageSettingsChange} />}
        {model.catalogError && <div className="node-note node-note-compact">{typeof (model.catalogError) === 'string' ? tUi((model.catalogError) as string) : (model.catalogError)}</div>}
        {model.modelUnavailable && !model.loading && <div className="node-note node-note-compact">{tUi("Выбранная модель недоступна. Обновите каталог или выберите другую модель.")}</div>}
      </CollapsibleSection>
      <PrimaryActionButton
        icon={node.status === 'running' ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}
        onClick={model.handleGenerate}
        disabled={node.status === 'running' || model.loading || model.modelUnavailable}
      >
        Generate
      </PrimaryActionButton>
      <CollapsibleSection title="Result" open={model.resultOpen} onOpenChange={model.setResultOpen} sidePort={<PortButton nodeId={node.id} portId="image" side="output" kind="image" label="Image" className="node-port-section" onStartConnection={onStartConnection} />}>
        <ImagePlate
          activeIndex={model.generationHistory.activeIndex}
          assetId={model.generationHistory.activeAssetId}
          assetIds={model.generationHistory.assetIds}
          assetMetadata={model.data.resultMetadata}
          aspectRatio={model.selectedAspectRatio}
          loading={node.status === 'running'}
          renderLoadingOverlay={({ previewUrl }) => (
            <GenerationWaitingExperience
              kind="image"
              phase={model.generationWaitPhase}
              previousImageUrl={previewUrl}
              seed={model.data.generationRequest?.jobId ?? model.data.generationRequest?.idempotencyKey ?? node.id}
            />
          )}
          onActiveIndexChange={model.handleGenerationHistoryChange}
          onMaskEdit={model.handleMaskEdit}
          sourceModel={model.data.model}
        />
      </CollapsibleSection>
      {model.data.message ? <div className="node-note node-note-compact">{model.data.message}</div> : null}
    </>
  );
}
