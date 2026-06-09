'use client';

import { Loader2, MapPin, Sparkles } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { PromptBox } from '@/shared/ui/prompt-box';
import { SettingRow } from '@/shared/ui/setting-row';
import {
  locationPreserveStrengthOptions,
  locationTypeOptions,
  useLocationBuilderNodeModel,
} from '../../model/use-location-builder-node-model';
import { useNodeDisplayState } from '../../model/use-node-display-state';
import { EntityBuilderInputRow } from '../entity-builder-input-row';
import { NodeTitle, TextNodeTitleActions } from '../node-title';
import { PortButton } from '../port-button';
import { NodeReferenceGrid } from '../reference-grid';

interface LocationBuilderNodeProps {
  node: ProductionNode;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
}

export function LocationBuilderNode({ node, onStartConnection }: LocationBuilderNodeProps) {
  const model = useLocationBuilderNodeModel(node);
  const { isCollapsed: collapsed, setCollapsed } = useNodeDisplayState(node.id);

  return (
    <>
      <NodeTitle
        title={model.data.title}
        nodeType={node.type}
        muted
        action={<TextNodeTitleActions collapsed={collapsed} onCollapsedChange={setCollapsed} />}
      />
      <PortButton
        nodeId={node.id}
        portId="location"
        side="output"
        kind="location"
        label="Location"
        className="text-node-header-output-port"
        onStartConnection={onStartConnection}
      />
      {!collapsed ? (
        <>
          <CollapsibleSection title="Library" className="text-node-section subject-node-library-section">
            {model.locationLibraryOptions.length > 0 ? (
              <SettingRow
                label="Load"
                value={model.selectedLibraryLocationId}
                options={model.locationLibraryOptions}
                onChange={model.handleApplyLocationFromLibrary}
                wide
              />
            ) : (
              <div className="node-note subject-node-library-empty">No published locations yet.</div>
            )}
            <SettingRow label="Type" value={model.locationType} options={locationTypeOptions} onChange={model.handleLocationTypeChange} wide />
            <SettingRow label="Preserve" value={model.preserveStrength} options={locationPreserveStrengthOptions} onChange={model.handlePreserveStrengthChange} wide />
            <div className="subject-node-name-row">
              <MapPin size={14} />
              <input
                className="subject-node-name-input"
                value={model.data.name}
                onChange={(event) => model.handleNameChange(event.target.value)}
                placeholder="Name or working ID"
                data-node-interactive
              />
            </div>
            <div className="subject-node-field-label">Description</div>
            <PromptBox value={model.data.description} onChange={model.handleDescriptionChange} className="subject-node-prompt-box" placeholder="Description" />
            <button type="button" className="secondary-node-button subject-node-library-button" onClick={model.handlePublishLocation} data-node-interactive>
              {model.data.libraryLocationId ? 'Update Library' : 'Publish Location'}
            </button>
          </CollapsibleSection>
          <CollapsibleSection title="Inputs" className="text-node-section subject-node-inputs-section">
            <EntityBuilderInputRow
              nodeId={node.id}
              portId="image"
              kind="image"
              label="Image refs"
              countLabel={model.imageCount > 0 ? `${model.imageCount} image` : 'Empty'}
              isConnected={model.imageCount > 0}
              onStartConnection={onStartConnection}
            />
            <EntityBuilderInputRow
              nodeId={node.id}
              portId="text"
              kind="text"
              label="Text notes"
              countLabel={model.textCount > 0 ? `${model.textCount} text` : 'Empty'}
              isConnected={model.textCount > 0}
              onStartConnection={onStartConnection}
            />
            <NodeReferenceGrid
              ariaLabel="Location image references"
              altPrefix="Location reference"
              items={model.imageReferenceItems}
              onRemove={model.handleRemoveImageReference}
            />
            <div className="subject-node-input-actions">
              <button
                type="button"
                className="secondary-node-button subject-node-input-action-button subject-node-describe-button"
                onClick={model.handleDescribeLocation}
                disabled={!model.canDescribeLocation}
                data-node-interactive
              >
                {model.describing ? <Loader2 size={14} className="node-button-spinner" /> : <Sparkles size={14} />}
                {model.describing ? 'Generating...' : 'Generate Description'}
              </button>
            </div>
          </CollapsibleSection>
          <CollapsibleSection title="Passport" className="text-node-section subject-node-result-section">
            <PromptBox value={model.result} readonly className="subject-node-result-box" />
          </CollapsibleSection>
          <CollapsibleSection title="Constraints" className="text-node-section subject-node-constraints-section" defaultOpen={false}>
            <PromptBox value={model.data.spatialLayout} onChange={model.handleSpatialLayoutChange} className="subject-node-prompt-box subject-node-small-box" placeholder="Spatial layout: geometry, scale, foreground, midground, background" />
            <PromptBox value={model.data.atmosphere} onChange={model.handleAtmosphereChange} className="subject-node-prompt-box subject-node-small-box" placeholder="Atmosphere, surfaces, weather, material language, environmental cues" />
            <PromptBox value={model.data.mutableAttributes} onChange={model.handleMutableAttributesChange} className="subject-node-prompt-box subject-node-small-box" placeholder="Can change: camera, time, weather, dressing, actors, action, style" />
            <PromptBox value={model.data.negativeConstraints} onChange={model.handleNegativeConstraintsChange} className="subject-node-prompt-box subject-node-small-box" placeholder="Must not appear or must not be changed" />
            <PromptBox value={model.data.notes} onChange={model.handleNotesChange} className="subject-node-prompt-box subject-node-small-box" placeholder="Additional passport notes" />
          </CollapsibleSection>
          {model.data.message ? <div className="node-note node-note-compact subject-node-message">{model.data.message}</div> : null}
        </>
      ) : null}
    </>
  );
}
