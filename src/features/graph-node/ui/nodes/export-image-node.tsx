'use client';

import { BookmarkPlus, Download, Loader2 } from '@prodactionpro/ui-core/icons';
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
      <NodeTitle title={node.data.title} nodeType={node.type} muted />
      <ImagePlate
        assetIds={model.previewAssetIds}
        activeIndex={model.activeIndex}
        onActiveIndexChange={model.handleActiveIndexChange}
        navigationLabels={{ previous: 'Previous export image', next: 'Next export image' }}
        loading={model.previewLoading}
        outputPending={model.previewPending}
      />
      {model.sourceCount > 0 ? (
        <div className="export-batch-summary">
          <span>{model.sourceCount > 1
            ? `Preview · ${model.activeIndex + 1} of ${model.sourceCount} source images`
            : 'Converted output'}</span>
          {model.activeSourceItem?.sourceLabel ? <strong>{model.activeSourceItem.sourceLabel}</strong> : null}
        </div>
      ) : null}
      <PrimaryActionButton
        icon={model.exporting ? <Loader2 className="spin" size={17} /> : <Download size={17} />}
        onClick={model.handleDownload}
        disabled={model.sourceCount === 0 || model.exporting}
      >
        {model.downloadLabel}
      </PrimaryActionButton>
      <PrimaryActionButton
        className="primary-node-button-secondary"
        icon={model.savingToLibrary
          ? <Loader2 className="spin" size={17} />
          : <BookmarkPlus size={17} />}
        onClick={model.handleSaveToLibrary}
        disabled={!model.sourceAsset || model.savingToLibrary}
      >
        Save current to Library
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
