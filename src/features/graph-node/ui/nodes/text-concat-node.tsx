'use client';

import { Plus } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useState } from 'react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { PromptBox } from '@/shared/ui/prompt-box';
import { useTextConcatNodeModel } from '../../model/use-text-workflow-node-models';
import { NodeTitle, TextNodeTitleActions } from '../node-title';
import { PortButton } from '../port-button';

interface TextConcatNodeProps {
  node: ProductionNode;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
}

export function TextConcatNode({ node, onStartConnection }: TextConcatNodeProps) {
  const model = useTextConcatNodeModel(node);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      <NodeTitle title="Concatenate" muted action={<TextNodeTitleActions collapsed={collapsed} onCollapsedChange={setCollapsed} />} />
      {model.inputSlots.map((slot, index) => (
        <PortButton
          key={slot.portId}
          nodeId={node.id}
          portId={slot.portId}
          side="input"
          kind="text"
          label={`Input ${index + 1}`}
          className="text-concat-input-port"
          style={{ top: 40 + index * 40 }}
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
        onStartConnection={onStartConnection}
      />
      {!collapsed ? (
        <>
          <CollapsibleSection
            title="Result"
            className="text-node-section text-node-result-section"
          >
            <PromptBox value={model.result} readonly className="text-node-result-box text-concat-result-box" />
          </CollapsibleSection>
          <CollapsibleSection title="Optional Text" className="text-node-section text-node-optional-section">
            <PromptBox value={model.optionalText} onChange={model.handleOptionalTextChange} className="text-node-optional-box" />
          </CollapsibleSection>
          <div className="text-concat-add-container">
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
