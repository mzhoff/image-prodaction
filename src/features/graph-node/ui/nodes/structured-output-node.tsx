'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { ProductionNode, StructuredOutputNodeData } from '@/entities/production-graph/model/types';
import { useNodeDisplayState } from '../../model/use-node-display-state';
import { usePipelineContractNodeModel } from '../../model/use-pipeline-contract-node-model';
import { NodeTitle, TextNodeTitleActions } from '../node-title';
import {
  CollapsedPipelineFieldPorts,
  PipelineContractFieldList,
} from '../pipeline-contract-field-list';
import { PortButton } from '../port-button';

interface StructuredOutputNodeProps {
  node: ProductionNode;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
}

export function StructuredOutputNode({ node, onStartConnection }: StructuredOutputNodeProps) {
  const model = usePipelineContractNodeModel(node);
  const data = model.data as StructuredOutputNodeData;
  const { isCollapsed: collapsed, setCollapsed } = useNodeDisplayState(node.id);
  const [schemaNameDraft, setSchemaNameDraft] = useState(data.schemaName);
  const cancelSchemaCommitRef = useRef(false);

  useEffect(() => {
    setSchemaNameDraft(data.schemaName);
  }, [data.schemaName]);

  const commitSchemaName = () => {
    if (cancelSchemaCommitRef.current) {
      cancelSchemaCommitRef.current = false;
      return;
    }
    const nextName = schemaNameDraft.trim();
    if (!nextName) {
      setSchemaNameDraft(data.schemaName);
      return;
    }
    model.handleSchemaNameChange(nextName);
  };

  return (
    <>
      <NodeTitle
        title={data.title}
        nodeType={node.type}
        muted
        action={(
          <TextNodeTitleActions
            collapsed={collapsed}
            count={`${model.fields.length}`}
            onCollapsedChange={setCollapsed}
          />
        )}
      />
      <PortButton
        nodeId={node.id}
        portId="source"
        side="input"
        kind="any"
        label="Source"
        className="text-node-header-input-port"
        style={{ top: collapsed ? 20 : 40 }}
        onStartConnection={onStartConnection}
      />
      <PortButton
        nodeId={node.id}
        portId="json"
        side="output"
        kind="json"
        label="JSON"
        className="text-node-header-output-port"
        style={{ top: collapsed ? 20 : 40 }}
        onStartConnection={onStartConnection}
      />
      {collapsed ? (
        <CollapsedPipelineFieldPorts
          fields={model.fields}
          nodeId={node.id}
          onStartConnection={onStartConnection}
          portSide="output"
        />
      ) : (
        <>
          <label className="pipeline-contract-schema-name" data-node-interactive>
            <span>Schema</span>
            <input
              value={schemaNameDraft}
              aria-label="Structured output schema name"
              onBlur={commitSchemaName}
              onChange={(event) => setSchemaNameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelSchemaCommitRef.current = true;
                  setSchemaNameDraft(data.schemaName);
                  event.currentTarget.blur();
                }
              }}
            />
          </label>
          <PipelineContractFieldList
            fields={model.fields}
            nodeId={node.id}
            onFieldsChange={model.handleFieldsChange}
            onStartConnection={onStartConnection}
            portSide="output"
          />
          {model.message ? <div className="pipeline-contract-node-message" role="alert">{model.message}</div> : null}
        </>
      )}
    </>
  );
}
