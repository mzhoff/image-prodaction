'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import {
  COLLAPSED_NODE_PORT_TOP,
  getCollapsedTextSplitterOutputPorts,
} from '../../lib/collapsed-node-layout';
import { useNodeDisplayState } from '../../model/use-node-display-state';
import { useTextSplitterNodeModel } from '../../model/use-text-workflow-node-models';
import { NodeTitle, TextNodeTitleActions } from '../node-title';
import { PortButton } from '../port-button';

interface TextSplitterNodeProps {
  node: ProductionNode;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
}

export function TextSplitterNode({ node, onStartConnection }: TextSplitterNodeProps) {
  const model = useTextSplitterNodeModel(node);
  const { isCollapsed: collapsed, setCollapsed } = useNodeDisplayState(node.id);
  const collapsedOutputPorts = getCollapsedTextSplitterOutputPorts(model.items.length);

  return (
    <>
      <NodeTitle title={node.data.title} nodeType={node.type} muted action={<TextNodeTitleActions collapsed={collapsed} count={`${model.items.length}/30`} onCollapsedChange={setCollapsed} />} />
      <PortButton
        nodeId={node.id}
        portId="text"
        side="input"
        kind="text"
        label="Text"
        className="text-node-header-input-port"
        style={{ top: collapsed ? COLLAPSED_NODE_PORT_TOP : undefined }}
        onStartConnection={onStartConnection}
      />
      {collapsed ? (
        collapsedOutputPorts.map((port) => (
          <PortButton
            key={`collapsed:${port.id}`}
            nodeId={node.id}
            portId={port.id}
            side="output"
            kind="text"
            label={port.label}
            className={port.visuallyHidden
              ? 'text-node-header-output-port text-splitter-collapsed-item-port'
              : 'text-node-header-output-port text-splitter-collapsed-output-port'}
            style={{ top: COLLAPSED_NODE_PORT_TOP }}
            onStartConnection={onStartConnection}
          />
        ))
      ) : (
        <PortButton
          nodeId={node.id}
          portId="items"
          side="output"
          kind="text"
          label="Items"
          className="text-node-header-output-port"
          onStartConnection={onStartConnection}
        />
      )}
      {!collapsed ? (
        <>
          <div className="text-split-rule-row">
            <span>Split text by</span>
            <input
              className="text-split-rule-input"
              value={model.data.delimiter}
              onChange={(event) => model.handleSplitRuleChange(event.target.value)}
              aria-label="Split text by delimiter"
            />
          </div>
          <div className="text-split-items">
            {model.message ? <div className="node-note">{model.message}</div> : null}
            {model.items.length === 0 ? (
              <div className="text-split-empty-row">Connect text input to split it into output items.</div>
            ) : null}
            {model.items.map((item, index) => (
              <div className="text-split-output-row" key={`${index}:${item.slice(0, 20)}`}>
                <div className="text-split-item-box" title={item}>{item}</div>
                <PortButton
                  nodeId={node.id}
                  portId={`item-${index}`}
                  side="output"
                  kind="text"
                  label={`Item ${index + 1}`}
                  className="node-port-row"
                  onStartConnection={onStartConnection}
                />
              </div>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
