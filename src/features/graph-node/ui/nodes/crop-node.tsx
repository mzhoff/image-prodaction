'use client';

import { Link2, RotateCcw } from 'lucide-react';
import type { ChangeEvent } from 'react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { cn } from '@/shared/lib/cn';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { DarkSelect } from '@/shared/ui/dark-select';
import { useAssetUrl } from '@/entities/production-graph/model/use-asset-url';
import { useCropImageNodeModel } from '../../model/use-crop-image-node-model';
import { CropEditor } from '../crop-editor';
import { NodeTitle } from '../node-title';

export function CropNode({ node }: { node: ProductionNode }) {
  const model = useCropImageNodeModel(node);
  const sourceUrl = useAssetUrl(model.sourceAsset?.id);

  return (
    <>
      <NodeTitle title="Crop" muted />
      <CropEditor
        aspectRatio={model.aspectRatio}
        crop={model.crop}
        imageHeight={model.sourceAsset?.height}
        imageWidth={model.sourceAsset?.width}
        locked={model.locked}
        onCropChange={model.handleCropChange}
        onCropDragStart={model.handleCropDragStart}
        url={sourceUrl ?? undefined}
      />
      <CollapsibleSection title="Settings">
        <div className="crop-setting-row">
          <span>Aspect Ratio</span>
          <div className="crop-setting-actions">
            <DarkSelect
              value={model.aspectRatio}
              options={model.aspectRatioOptions}
              onChange={model.handleAspectRatioChange}
            />
            <button
              type="button"
              className="crop-reset-button"
              aria-label="Reset crop"
              title="Reset"
              onClick={model.handleReset}
              data-node-interactive
            >
              <span>Reset</span>
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
        <div className="crop-setting-row">
          <span>Size</span>
          <div className="crop-setting-actions crop-size-actions">
            <CropSizeInput
              label="W"
              value={model.pixelSize.width}
              disabled={!model.sourceAsset}
              onChange={(value) => model.handlePixelSizeChange('width', value)}
            />
            <CropSizeInput
              label="H"
              value={model.pixelSize.height}
              disabled={!model.sourceAsset}
              onChange={(value) => model.handlePixelSizeChange('height', value)}
            />
            <button
              type="button"
              className={cn('crop-lock-button', model.locked && 'crop-lock-button-active')}
              aria-pressed={model.locked}
              aria-label={model.locked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
              onClick={model.handleLockToggle}
              data-node-interactive
            >
              <Link2 size={15} />
            </button>
          </div>
        </div>
      </CollapsibleSection>
      {model.message ? <div className="node-note node-note-compact">{model.message}</div> : null}
    </>
  );
}

function CropSizeInput({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  value: number;
}) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
  };

  return (
    <label className="crop-size-input" data-node-interactive>
      <span>{label}</span>
      <input
        type="number"
        min={1}
        step={1}
        value={value}
        disabled={disabled}
        onChange={handleChange}
        onPointerDown={(event) => event.stopPropagation()}
      />
    </label>
  );
}
