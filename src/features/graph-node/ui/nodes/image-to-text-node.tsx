'use client';

import { Loader2, Maximize2, Minimize2, Play } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ExtractPresetId, ProductionNode } from '@/entities/production-graph/model/types';
import { extractPresetOptions } from '@/entities/production-graph/model/extract-presets';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { DarkMultiSelect } from '@/shared/ui/dark-multi-select';
import { PromptBox } from '@/shared/ui/prompt-box';
import { SettingRow } from '@/shared/ui/setting-row';
import { useExtractNodeModel } from '../../model/use-extract-node-model';
import { ExtractLayerTags } from '../extract-layer-tags';
import { ExtractResultBox } from '../extract-result-box';
import { NodeTitle, NodeTitleActions, NodeTitleOptionsButton } from '../node-title';
import { PortButton } from '../port-button';

interface ImageToTextNodeProps {
  node: ProductionNode;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
}

const useRichExtractResultEditor = true;

export function ImageToTextNode({ node, onStartConnection }: ImageToTextNodeProps) {
  const model = useExtractNodeModel(node);

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
      <CollapsibleSection title="Settings" open={model.settingsOpen} onOpenChange={model.setSettingsOpen}>
        <div className="setting-row">
          <span>Preset</span>
          <DarkMultiSelect
            value={model.selectedPresets}
            label={model.selectedPresetLabel}
            options={extractPresetOptions}
            onChange={(presetIds) => model.handlePresetChange(presetIds as ExtractPresetId[])}
            wide
          />
        </div>
        <SettingRow label="Model" value={model.selectedModel} options={model.modelOptions} onChange={model.handleModelChange} wide />
      </CollapsibleSection>
      <CollapsibleSection title="Prompt" open={model.promptOpen} onOpenChange={model.setPromptOpen}>
        <PromptBox value={model.data.prompt} onChange={model.handlePromptChange} />
      </CollapsibleSection>
      <button type="button" className="secondary-node-button" onClick={model.handleAnalyze} disabled={node.status === 'running' || model.loading}>
        {node.status === 'running' ? <Loader2 className="spin" size={15} /> : <Play size={15} />}
        Analyze
      </button>
      <CollapsibleSection
        title="Result"
        open={model.resultOpen}
        onOpenChange={model.setResultOpen}
        sidePort={!model.resultOpen ? <PortButton nodeId={node.id} portId="result" side="output" kind="text" label="Result" className="node-port-section" onStartConnection={onStartConnection} /> : null}
      >
        <div className="node-result-port-anchor">
          <PortButton nodeId={node.id} portId="result" side="output" kind="text" label="Result" className="node-port-result" onStartConnection={onStartConnection} />
          <ExtractLayerTags text={model.data.result} disabledLayerIds={model.disabledLayerIds} onToggle={model.handleLayerToggle} />
          {useRichExtractResultEditor ? (
            <ExtractResultBox value={model.data.result} disabledLayerIds={model.disabledLayerIds} onChange={model.handleResultChange} />
          ) : (
            <PromptBox value={model.data.result} onChange={model.handleResultChange} />
          )}
        </div>
      </CollapsibleSection>
      {model.data.message ? <div className="node-note node-note-compact">{model.data.message}</div> : null}
    </>
  );
}
