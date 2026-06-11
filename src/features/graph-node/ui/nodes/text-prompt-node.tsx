'use client';

import { Maximize2, Minimize2, Plus } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useState } from 'react';
import type { ProductionNode, TextPromptNodeData } from '@/entities/production-graph/model/types';
import { DarkSelect } from '@/shared/ui/dark-select';
import { useNodeDisplayState } from '../../model/use-node-display-state';
import { clampTextPromptTextareaHeight, textPromptVariableDisplayOptions, useTextPromptNodeModel } from '../../model/use-text-workflow-node-models';
import { NodeTitle, NodeTitleActions, NodeTitleOptionsButton } from '../node-title';
import { PortButton } from '../port-button';
import { TextSectionDuplicateWarnings, TextSectionFilterTags } from '../text-section-filter-tags';
import { TextPromptVariableEditor } from '../text-prompt-variable-editor';

interface TextPromptNodeProps {
  node: ProductionNode;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
}

export function TextPromptNode({ node, onStartConnection }: TextPromptNodeProps) {
  const data = node.data as TextPromptNodeData;
  const model = useTextPromptNodeModel(node);
  const { isCollapsed: collapsed, setCollapsed } = useNodeDisplayState(node.id);
  const [draftTextareaHeight, setDraftTextareaHeight] = useState(model.textareaHeight);
  const textareaHeight = Math.max(draftTextareaHeight, getTextPromptTextareaMinHeight(model.variableSlots.length));

  useEffect(() => {
    setDraftTextareaHeight(model.textareaHeight);
  }, [model.textareaHeight]);

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (event.target !== event.currentTarget) return;

    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startHeight = textareaHeight;
    let nextHeight = startHeight;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      nextHeight = clampTextPromptTextareaHeight(
        Math.max(startHeight + moveEvent.clientY - startY, getTextPromptTextareaMinHeight(model.variableSlots.length)),
      );
      setDraftTextareaHeight(nextHeight);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (nextHeight !== model.textareaHeight) model.handleTextareaHeightChange(nextHeight);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  };

  return (
    <>
      <NodeTitle
        title={data.title}
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
                  setCollapsed(!collapsed);
                }}
                aria-label={collapsed ? 'Expand node' : 'Collapse node'}
              >
              {collapsed ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
            </button>
            <NodeTitleOptionsButton />
          </NodeTitleActions>
        )}
      />
      {model.variableSlots.map((slot, index) => (
        <PortButton
          key={slot.portId}
          nodeId={node.id}
          portId={slot.portId}
          side="input"
          kind="text"
          label={slot.alias}
          className="text-prompt-variable-port"
          style={{ top: collapsed ? getCollapsedTextPromptVariablePortTop() : getTextPromptVariablePortTop(index) }}
          onStartConnection={onStartConnection}
        />
      ))}
      <PortButton
        nodeId={node.id}
        portId="text"
        side="output"
        kind="text"
        label="Text"
        className="text-prompt-output-port"
        style={{ top: collapsed ? 20 : getTextPromptVariablePortTop(0) }}
        onStartConnection={onStartConnection}
      />
      {!collapsed ? (
        <div className="text-prompt-body">
          <TextPromptVariableEditor
            canAddVariable={model.canAddVariable}
            className="text-prompt-main-box"
            displayMode={model.variableDisplayMode}
            onAddVariable={model.handleAddVariable}
            onChange={model.handleTextChange}
            onRedo={model.handleRedo}
            onUndo={model.handleUndo}
            placeholder="Write prompt. Type @ to insert a variable."
            slots={model.variableSlots}
            style={{ height: textareaHeight }}
            value={data.text}
          />
          <TextSectionFilterTags
            className="text-prompt-filter-tags"
            disabledFilterIds={model.disabledResultFilterIds}
            onToggle={model.handleResultFilterToggle}
            text={model.result}
          />
          <TextSectionDuplicateWarnings
            className="text-prompt-filter-warnings"
            issues={model.resultFilterIssues}
          />
          <div
            className="text-prompt-footer"
            data-node-interactive
          >
            <div className="text-prompt-footer-controls">
              <button
                type="button"
                className="text-concat-add-button text-prompt-add-variable-button"
                disabled={!model.canAddVariable}
                onClick={model.handleAddVariable}
              >
                <Plus size={16} />
                <span>Add variable</span>
              </button>
              {model.hasVariables ? (
                <label className="text-prompt-display-control">
                  <span>Display</span>
                  <DarkSelect
                    value={model.variableDisplayMode}
                    options={textPromptVariableDisplayOptions}
                    onChange={model.handleDisplayModeChange}
                    wide
                  />
                </label>
              ) : null}
            </div>
            <div
              className="text-prompt-resize-zone text-node-bottom-drag-handle"
              onPointerDown={handleResizePointerDown}
              aria-label="Resize prompt text area"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

const TEXT_PROMPT_TEXTAREA_TOP = 54;
const TEXT_PROMPT_PORT_HEIGHT = 24;
const TEXT_PROMPT_VARIABLE_PORT_STEP = 39;
const TEXT_PROMPT_FIXED_HEIGHT_WITHOUT_TEXTAREA = 128;
function getTextPromptVariablePortTop(index: number) {
  return TEXT_PROMPT_TEXTAREA_TOP - TEXT_PROMPT_PORT_HEIGHT / 2 + index * TEXT_PROMPT_VARIABLE_PORT_STEP;
}

function getCollapsedTextPromptVariablePortTop() {
  return 20;
}

function getTextPromptTextareaMinHeight(variableCount: number) {
  if (variableCount <= 0) return 0;
  const lastPortBottom = getTextPromptVariablePortTop(variableCount - 1) + TEXT_PROMPT_PORT_HEIGHT;
  return Math.max(0, lastPortBottom - TEXT_PROMPT_FIXED_HEIGHT_WITHOUT_TEXTAREA);
}
