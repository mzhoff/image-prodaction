'use client';

import { ChevronLeft, ChevronRight, Loader2, Sparkles } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useState } from 'react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { PrimaryActionButton } from '@/shared/ui/primary-action-button';
import { PromptBox } from '@/shared/ui/prompt-box';
import { RangeSlider } from '@/shared/ui/range-slider';
import { SettingRow } from '@/shared/ui/setting-row';
import { useTextGenerationNodeModel } from '../../model/use-text-workflow-node-models';
import { NodeTitle, TextNodeTitleActions } from '../node-title';
import { PortButton } from '../port-button';
import { TextSectionDuplicateWarnings, TextSectionFilterTags } from '../text-section-filter-tags';
import { TextSectionResultBox } from '../text-section-result-box';

interface TextGenerationNodeProps {
  node: ProductionNode;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
}

export function TextGenerationNode({ node, onStartConnection }: TextGenerationNodeProps) {
  const model = useTextGenerationNodeModel(node);
  const [collapsed, setCollapsed] = useState(false);
  const [scrollTargetStart, setScrollTargetStart] = useState<number | null>(null);

  return (
    <>
      <NodeTitle title="Text Generate (LLM)" nodeType={node.type} muted action={<TextNodeTitleActions collapsed={collapsed} onCollapsedChange={setCollapsed} />} />
      <PortButton
        nodeId={node.id}
        portId="text"
        side="input"
        kind="text"
        label="Text"
        className="text-node-header-input-port"
        onStartConnection={onStartConnection}
      />
      <PortButton
        nodeId={node.id}
        portId="result"
        side="output"
        kind="text"
        label="Result"
        className="text-node-header-output-port"
        onStartConnection={onStartConnection}
      />
      {!collapsed ? (
        <>
          <CollapsibleSection title="Settings" className="text-node-section text-node-settings-section">
            <SettingRow label="Model" value={model.selectedModel} options={model.modelOptions} onChange={model.handleModelChange} wide />
            {model.supportsTemperature ? (
              <RangeSlider
                label="Creativity"
                min={0}
                max={2}
                step={0.1}
                value={model.temperature}
                valueLabel={`Creativity ${model.temperature.toFixed(1)}`}
                onChange={model.handleTemperatureChange}
              />
            ) : null}
            {model.supportsReasoning ? (
              <SettingRow label="Reasoning" value={model.reasoning} options={model.reasoningOptions} onChange={model.handleReasoningChange} />
            ) : null}
          </CollapsibleSection>
          <CollapsibleSection title="Prompt" className="text-node-section text-generation-prompt-section">
            <PromptBox value={model.data.instruction} onChange={model.handleInstructionChange} className="text-generation-prompt-box" />
          </CollapsibleSection>
          <PrimaryActionButton
            className="text-generation-button"
            icon={node.status === 'running' ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}
            onClick={model.handleGenerate}
            disabled={node.status === 'running' || model.loading}
          >
            ReGenerate
          </PrimaryActionButton>
          <CollapsibleSection
            title="Result"
            className="text-node-section text-generation-result-section"
          >
            {model.history.items.length > 1 ? (
              <TextResultVersionControl
                activeIndex={model.history.activeIndex}
                count={model.history.items.length}
                onChange={model.handleResultHistoryChange}
              />
            ) : null}
            <TextSectionFilterTags
              className="text-generation-filter-tags"
              disabledFilterIds={model.disabledResultFilterIds}
              onToggle={model.handleResultFilterToggle}
              text={model.history.activeText}
            />
            <TextSectionResultBox
              ariaLabel="Text generation result"
              value={model.history.activeText}
              className="text-generation-result-box"
              disabledFilterIds={model.disabledResultFilterIds}
              onChange={model.handleResultChange}
              scrollToStart={scrollTargetStart}
            />
          </CollapsibleSection>
          <TextSectionDuplicateWarnings
            issues={model.resultFilterIssues}
            onSelectIssue={(issue) => {
              setScrollTargetStart(null);
              window.requestAnimationFrame(() => setScrollTargetStart(issue.start));
            }}
          />
          {model.data.message ? <div className="node-note node-note-compact">{model.data.message}</div> : null}
        </>
      ) : null}
    </>
  );
}

function TextResultVersionControl({
  activeIndex,
  count,
  onChange,
}: {
  activeIndex: number;
  count: number;
  onChange: (index: number) => void;
}) {
  const currentIndex = getSafeVersionIndex(activeIndex, count);

  return (
    <div className="text-generation-version-row" data-node-interactive>
      <span>Version</span>
      <div className="text-generation-version-controls">
        <button
          type="button"
          aria-label="Previous text version"
          title="Previous"
          onClick={() => onChange(wrapVersionIndex(currentIndex - 1, count))}
        >
          <ChevronLeft size={14} />
        </button>
        <strong>{currentIndex + 1}/{count}</strong>
        <button
          type="button"
          aria-label="Next text version"
          title="Next"
          onClick={() => onChange(wrapVersionIndex(currentIndex + 1, count))}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

function getSafeVersionIndex(index: number, count: number) {
  if (count <= 0) return -1;
  if (!Number.isFinite(index)) return count - 1;
  return Math.min(Math.max(index, 0), count - 1);
}

function wrapVersionIndex(index: number, count: number) {
  if (count <= 0) return -1;
  return (index + count) % count;
}
