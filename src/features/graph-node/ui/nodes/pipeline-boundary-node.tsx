'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { useNodeDisplayState } from '../../model/use-node-display-state';
import { usePipelineContractNodeModel } from '../../model/use-pipeline-contract-node-model';
import { NodeTitle, TextNodeTitleActions } from '../node-title';
import {
  CollapsedPipelineFieldPorts,
  PipelineContractFieldList,
} from '../pipeline-contract-field-list';

interface PipelineBoundaryNodeProps {
  node: ProductionNode;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  portSide: 'input' | 'output';
}

export function PipelineBoundaryNode({ node, onStartConnection, portSide }: PipelineBoundaryNodeProps) {
  const model = usePipelineContractNodeModel(node);
  const { isCollapsed: collapsed, setCollapsed } = useNodeDisplayState(node.id);

  return (
    <>
      <NodeTitle
        title={model.data.title}
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
      {collapsed ? (
        <CollapsedPipelineFieldPorts
          fields={model.fields}
          nodeId={node.id}
          onStartConnection={onStartConnection}
          portSide={portSide}
        />
      ) : (
        <>
          <div className="pipeline-contract-node-summary">
            {portSide === 'output'
              ? 'Values supplied when this pipeline starts.'
              : 'Values returned to the pipeline consumer.'}
          </div>
          <PipelineContractFieldList
            allowDefaults={portSide === 'output'}
            allowImageFields
            fields={model.fields}
            nodeId={node.id}
            onFieldsChange={model.handleFieldsChange}
            onStartConnection={onStartConnection}
            portSide={portSide}
          />
          {model.message ? <div className="pipeline-contract-node-message" role="alert">{model.message}</div> : null}
        </>
      )}
    </>
  );
}
