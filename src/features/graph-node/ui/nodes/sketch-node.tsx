'use client';

import Image from 'next/image';
import { ImageUp, Paintbrush } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO } from '@/entities/production-graph/model/node-layout';
import type { ProductionNode, SketchNodeData } from '@/entities/production-graph/model/types';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { SettingRow } from '@/shared/ui/setting-row';
import { useAssetUrl } from '@/entities/production-graph/model/use-asset-url';
import { useSketchNodeModel } from '../../model/use-sketch-node-model';
import { NodeTitle } from '../node-title';
import { SketchEditorOverlay } from '../sketch-editor-overlay';

export function SketchNode({ node }: { node: ProductionNode }) {
  const model = useSketchNodeModel(node);
  const [editorOpen, setEditorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);

  return (
    <>
      <NodeTitle title="Sketch" muted />
      <SketchPreview data={model.data} />
      <button type="button" className="primary-node-button" onClick={() => setEditorOpen(true)} data-node-interactive>
        <Paintbrush size={16} />
        Edit
      </button>
      <CollapsibleSection title="Settings" open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SettingRow
          label="Aspect Ratio"
          value={model.aspectRatio}
          options={model.aspectRatioOptions}
          onChange={model.handleAspectRatioChange}
        />
      </CollapsibleSection>
      {editorOpen ? createPortal(
        <SketchEditorOverlay model={model} onClose={() => setEditorOpen(false)} />,
        document.body,
      ) : null}
    </>
  );
}

function SketchPreview({ data }: { data: SketchNodeData }) {
  const url = useAssetUrl(data.assetId);
  const aspectRatio = (data.aspectRatio || DEFAULT_IMAGE_PLACEHOLDER_ASPECT_RATIO).replace(':', ' / ');

  return (
    <div className="sketch-preview" style={{ aspectRatio }} onDragStart={(event) => event.preventDefault()}>
      {url ? (
        <Image src={url} alt="Sketch preview" fill sizes="368px" unoptimized draggable={false} className="sketch-preview-media" />
      ) : (
        <div className="sketch-preview-empty">
          <ImageUp size={22} />
        </div>
      )}
    </div>
  );
}
