'use client';

import { Fingerprint, Loader2, Sparkles } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useState } from 'react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { PromptBox } from '@/shared/ui/prompt-box';
import { SettingRow } from '@/shared/ui/setting-row';
import {
  subjectPreserveStrengthOptions,
  subjectTypeOptions,
  useSubjectBuilderNodeModel,
} from '../../model/use-subject-builder-node-model';
import { EntityBuilderInputRow } from '../entity-builder-input-row';
import { NodeTitle, TextNodeTitleActions } from '../node-title';
import { PortButton } from '../port-button';
import { NodeReferenceGrid } from '../reference-grid';

interface SubjectBuilderNodeProps {
  node: ProductionNode;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
}

export function SubjectBuilderNode({ node, onStartConnection }: SubjectBuilderNodeProps) {
  const model = useSubjectBuilderNodeModel(node);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      <NodeTitle
        title="Subject Builder"
        nodeType={node.type}
        muted
        action={<TextNodeTitleActions collapsed={collapsed} onCollapsedChange={setCollapsed} />}
      />
      <PortButton
        nodeId={node.id}
        portId="subject"
        side="output"
        kind="subject"
        label="Subject"
        className="text-node-header-output-port"
        onStartConnection={onStartConnection}
      />
      {!collapsed ? (
        <>
          <CollapsibleSection title="Library" className="text-node-section subject-node-library-section">
            {model.subjectLibraryOptions.length > 0 ? (
              <SettingRow
                label="Load"
                value={model.selectedLibrarySubjectId}
                options={model.subjectLibraryOptions}
                onChange={model.handleApplySubjectFromLibrary}
                wide
              />
            ) : (
              <div className="node-note subject-node-library-empty">No published subjects yet.</div>
            )}
            <SettingRow label="Type" value={model.subjectType} options={subjectTypeOptions} onChange={model.handleSubjectTypeChange} wide />
            <SettingRow label="Preserve" value={model.preserveStrength} options={subjectPreserveStrengthOptions} onChange={model.handlePreserveStrengthChange} wide />
            <div className="subject-node-name-row">
              <Fingerprint size={14} />
              <input
                className="subject-node-name-input"
                value={model.data.name}
                onChange={(event) => model.handleNameChange(event.target.value)}
                placeholder="Name or working ID"
                data-node-interactive
              />
            </div>
            <div className="subject-node-field-label">Description</div>
            <PromptBox value={model.data.identitySummary} onChange={model.handleIdentitySummaryChange} className="subject-node-prompt-box" placeholder="Description" />
            <button type="button" className="secondary-node-button subject-node-library-button" onClick={model.handlePublishSubject} data-node-interactive>
              {model.data.librarySubjectId ? 'Update Library' : 'Publish Subject'}
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
              ariaLabel="Subject image references"
              altPrefix="Subject reference"
              items={model.imageReferenceItems}
              onRemove={model.handleRemoveImageReference}
            />
            <div className="subject-node-input-actions">
              <button
                type="button"
                className="secondary-node-button subject-node-input-action-button subject-node-describe-button"
                onClick={model.handleDescribeSubject}
                disabled={!model.canDescribeSubject}
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
            <PromptBox value={model.data.immutableTraits} onChange={model.handleImmutableTraitsChange} className="subject-node-prompt-box subject-node-small-box" placeholder="Cannot change: stable identity, face, silhouette, marks, materials" />
            <PromptBox value={model.data.mutableAttributes} onChange={model.handleMutableAttributesChange} className="subject-node-prompt-box subject-node-small-box" placeholder="Can change: clothing, pose, emotion, lighting, scene context" />
            <PromptBox value={model.data.negativeConstraints} onChange={model.handleNegativeConstraintsChange} className="subject-node-prompt-box subject-node-small-box" placeholder="Must not appear or must not be changed" />
            <PromptBox value={model.data.notes} onChange={model.handleNotesChange} className="subject-node-prompt-box subject-node-small-box" placeholder="Additional passport notes" />
          </CollapsibleSection>
          {model.data.message ? <div className="node-note node-note-compact subject-node-message">{model.data.message}</div> : null}
        </>
      ) : null}
    </>
  );
}
