'use client';

import { Plus } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useState } from 'react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { PromptBox } from '@/shared/ui/prompt-box';
import { useNodeDisplayState } from '../../model/use-node-display-state';
import { clampTextConcatOptionalHeight, useTextConcatNodeModel } from '../../model/use-text-workflow-node-models';
import { FilteredTextSectionOutput } from '../filtered-text-section-output';
import { NodeTitle, TextNodeTitleActions } from '../node-title';
import { PortButton } from '../port-button';

interface TextConcatNodeProps {
  node: ProductionNode;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
}

export function TextConcatNode({ node, onStartConnection }: TextConcatNodeProps) {
  const model = useTextConcatNodeModel(node);
  const { isCollapsed: collapsed, setCollapsed } = useNodeDisplayState(node.id);
  const [draftOptionalHeight, setDraftOptionalHeight] = useState(model.optionalTextHeight);

  useEffect(() => {
    setDraftOptionalHeight(model.optionalTextHeight);
  }, [model.optionalTextHeight]);

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (event.target !== event.currentTarget) return;

    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startHeight = draftOptionalHeight;
    let nextHeight = startHeight;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      nextHeight = clampTextConcatOptionalHeight(startHeight + moveEvent.clientY - startY);
      setDraftOptionalHeight(nextHeight);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (nextHeight !== model.optionalTextHeight) {
        model.handleOptionalTextHeightChange(nextHeight);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  };

  return (
    <>
      <NodeTitle title={node.data.title} nodeType={node.type} muted action={<TextNodeTitleActions collapsed={collapsed} onCollapsedChange={setCollapsed} />} />
      {model.inputSlots.map((slot, index) => (
        <PortButton
          key={slot.portId}
          nodeId={node.id}
          portId={slot.portId}
          side="input"
          kind="text"
          label={`Input ${index + 1}`}
          className="text-concat-input-port"
          style={{ top: collapsed ? 20 : 40 + index * 40 }}
          onStartConnection={onStartConnection}
        />
      ))}
      <PortButton
        nodeId={node.id}
        portId="result"
        side="output"
        kind="text"
        label="Result"
        className="text-node-header-output-port"
        style={{ top: collapsed ? 20 : 40 }}
        onStartConnection={onStartConnection}
      />
      {!collapsed ? (
        <>
          <CollapsibleSection
            title="Result"
            className="text-node-section text-node-result-section"
          >
            <FilteredTextSectionOutput
              ariaLabel="Concat result"
              boxClassName="text-node-result-box text-concat-result-box"
              disabledFilterIds={model.disabledResultFilterIds}
              issues={model.resultFilterIssues}
              onToggle={model.handleResultFilterToggle}
              readOnly
              tagsClassName="text-node-result-filter-tags"
              value={model.result}
            />
          </CollapsibleSection>
          <CollapsibleSection title="Optional Text" className="text-node-section text-node-optional-section">
            <PromptBox
              value={model.optionalText}
              onChange={model.handleOptionalTextChange}
              className="text-node-optional-box"
              style={{ height: draftOptionalHeight }}
            />
          </CollapsibleSection>
          <div
            className="text-concat-add-container text-node-bottom-drag-handle"
            data-node-interactive
            onPointerDown={handleResizePointerDown}
            aria-label="Resize optional text box"
          >
            <button type="button" className="text-concat-add-button" onClick={model.handleAddInput}>
              <Plus size={16} />
              <span>Add new input</span>
            </button>
          </div>
        </>
      ) : null}
    </>
  );
}
