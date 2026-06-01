'use client';

import { Download, Loader2 } from 'lucide-react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { PrimaryActionButton } from '@/shared/ui/primary-action-button';
import { SettingRow } from '@/shared/ui/setting-row';
import {
  exportFormatOptions,
  exportQualityOptions,
  exportScaleOptions,
  useExportImageNodeModel,
} from '../../model/use-export-image-node-model';
import { ImagePlate } from '../image-plate';
import { NodeTitle } from '../node-title';

export function ExportImageNode({ node }: { node: ProductionNode }) {
  const model = useExportImageNodeModel(node);

  return (
    <>
      <NodeTitle title="Export" muted />
      <ImagePlate assetId={model.sourceAsset?.id} />
      <PrimaryActionButton
        icon={model.exporting ? <Loader2 className="spin" size={17} /> : <Download size={17} />}
        onClick={model.handleDownload}
        disabled={!model.sourceAsset || model.exporting}
      >
        Download
      </PrimaryActionButton>
      <CollapsibleSection title="Settings">
        <SettingRow label="Format" value={model.data.format} options={exportFormatOptions} onChange={model.handleFormatChange} />
        {model.data.format !== 'png' ? (
          <SettingRow label="Quality" value={model.data.quality} options={exportQualityOptions} onChange={model.handleQualityChange} />
        ) : null}
        <SettingRow label="Scale" value={model.data.scale} options={exportScaleOptions} onChange={model.handleScaleChange} />
        <SettingRow label="Background" value={model.data.background} options={model.backgroundOptions} onChange={model.handleBackgroundChange} wide />
      </CollapsibleSection>
      {model.message ? <div className="node-note node-note-compact">{model.message}</div> : null}
    </>
  );
}
