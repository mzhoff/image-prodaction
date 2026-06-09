'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { PromptBox } from '@/shared/ui/prompt-box';
import { SettingRow } from '@/shared/ui/setting-row';
import { useIteratorNodeModel } from '../../model/use-iterator-node-model';
import { useNodeDisplayState } from '../../model/use-node-display-state';
import { EntityBuilderInputRow } from '../entity-builder-input-row';
import { ImagePlate } from '../image-plate';
import { NodeTitle, TextNodeTitleActions } from '../node-title';
import { PortButton } from '../port-button';

interface IteratorNodeProps {
  node: ProductionNode;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
}

export function IteratorNode({ node, onStartConnection }: IteratorNodeProps) {
  const model = useIteratorNodeModel(node);
  const { isCollapsed: collapsed, setCollapsed } = useNodeDisplayState(node.id);
  const countLabel = model.activeItemsCount > 0 ? `${model.activeIndex + 1}/${model.activeItemsCount}` : '0/0';

  return (
    <>
      <NodeTitle
        title={model.data.title}
        nodeType={node.type}
        muted
        action={<TextNodeTitleActions collapsed={collapsed} count={countLabel} onCollapsedChange={setCollapsed} />}
      />
      {collapsed ? (
        <>
          <PortButton
            nodeId={node.id}
            portId="imageCollection"
            side="input"
            kind="image"
            label="Image collection"
            className="text-node-header-input-port"
            style={{ top: 20 }}
            onStartConnection={onStartConnection}
          />
          <PortButton
            nodeId={node.id}
            portId="textCollection"
            side="input"
            kind="text"
            label="Text collection"
            className="text-node-header-input-port"
            style={{ top: 20 }}
            onStartConnection={onStartConnection}
          />
          <PortButton
            nodeId={node.id}
            portId="imageItem"
            side="output"
            kind="image"
            label="Image item"
            className="text-node-header-output-port"
            style={{ top: 20 }}
            onStartConnection={onStartConnection}
          />
          <PortButton
            nodeId={node.id}
            portId="textItem"
            side="output"
            kind="text"
            label="Text item"
            className="text-node-header-output-port"
            style={{ top: 20 }}
            onStartConnection={onStartConnection}
          />
        </>
      ) : null}
      {!collapsed ? (
        <>
          <CollapsibleSection title="Input" className="text-node-section iterator-node-input-section">
            <EntityBuilderInputRow
              nodeId={node.id}
              portId="imageCollection"
              kind="image"
              label="Image collection"
              countLabel={model.imageCount > 0 ? `${model.imageCount} image` : 'Empty'}
              isConnected={model.imageCount > 0}
              onStartConnection={onStartConnection}
            />
            <EntityBuilderInputRow
              nodeId={node.id}
              portId="textCollection"
              kind="text"
              label="Text collection"
              countLabel={model.textCount > 0 ? `${model.textCount} text` : 'Empty'}
              isConnected={model.textCount > 0}
              onStartConnection={onStartConnection}
            />
          </CollapsibleSection>

          <CollapsibleSection title="Current" className="text-node-section iterator-node-current-section">
            <SettingRow label="Mode" value={model.activeKind} options={model.kindOptions} onChange={model.handleKindChange} wide />
            {model.activeItemsCount > 0 ? (
              <SettingRow
                label="Item"
                value={String(model.activeIndex)}
                options={model.indexOptions}
                onChange={model.handleIndexSelectChange}
                wide
              />
            ) : null}
            <div className="iterator-node-stepper">
              <button type="button" className="secondary-node-button" onClick={model.handlePrevious} disabled={model.activeItemsCount <= 1} data-node-interactive>
                <ChevronLeft size={15} />
                Previous
              </button>
              <button type="button" className="secondary-node-button" onClick={model.handleNext} disabled={model.activeItemsCount <= 1} data-node-interactive>
                Next
                <ChevronRight size={15} />
              </button>
            </div>
            {model.activeKind === 'image' ? (
              <div className="iterator-node-preview">
                <ImagePlate
                  activeIndex={model.activeIndex}
                  assetId={model.activeImageAssetId}
                  assetIds={model.imageAssetIds}
                  onActiveIndexChange={model.handleIndexChange}
                  compact
                />
              </div>
            ) : (
              <PromptBox value={model.activeText} readonly className="iterator-node-text-preview" />
            )}
          </CollapsibleSection>

          <CollapsibleSection title="Output" className="text-node-section iterator-node-output-section">
            <IteratorOutputRow
              nodeId={node.id}
              portId="imageItem"
              kind="image"
              label="Image item"
              countLabel={model.activeKind === 'image' && model.activeImageAssetId ? 'Ready' : 'Empty'}
              isConnected={model.activeKind === 'image' && Boolean(model.activeImageAssetId)}
              onStartConnection={onStartConnection}
            />
            <IteratorOutputRow
              nodeId={node.id}
              portId="textItem"
              kind="text"
              label="Text item"
              countLabel={model.activeKind === 'text' && model.activeText ? 'Ready' : 'Empty'}
              isConnected={model.activeKind === 'text' && Boolean(model.activeText)}
              onStartConnection={onStartConnection}
            />
          </CollapsibleSection>

          {model.message ? <div className="node-note node-note-compact iterator-node-message">{model.message}</div> : null}
        </>
      ) : null}
    </>
  );
}

function IteratorOutputRow({
  countLabel,
  isConnected,
  kind,
  label,
  nodeId,
  onStartConnection,
  portId,
}: {
  countLabel: string;
  isConnected: boolean;
  kind: 'image' | 'text';
  label: string;
  nodeId: string;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  portId: string;
}) {
  return (
    <div
      className="setting-row iterator-output-row"
      data-port-node-id={nodeId}
      data-port-id={portId}
      data-port-side="output"
      data-connect-row="true"
    >
      <span>{label}</span>
      <span className={`input-pill ${isConnected ? 'input-pill-connected' : 'input-pill-empty'}`}>
        {countLabel}
      </span>
      <PortButton
        nodeId={nodeId}
        portId={portId}
        side="output"
        kind={kind}
        label={label}
        className="node-port-row iterator-output-row-port"
        onStartConnection={onStartConnection}
      />
    </div>
  );
}
