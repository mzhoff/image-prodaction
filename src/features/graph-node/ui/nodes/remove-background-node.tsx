'use client';

import { Loader2, Scissors } from 'lucide-react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { useRemoveBackgroundNodeModel } from '../../model/use-remove-background-node-model';
import { ImagePlate } from '../image-plate';
import { NodeTitle } from '../node-title';

export function RemoveBackgroundNode({ node }: { node: ProductionNode }) {
  const model = useRemoveBackgroundNodeModel(node);

  return (
    <>
      <NodeTitle title="Remove BG" muted />
      <ImagePlate assetId={model.displayAsset?.id} />
      <button
        type="button"
        className="primary-node-button"
        onClick={model.handleRemoveBackground}
        disabled={!model.sourceAsset || model.processing}
      >
        {model.processing ? <Loader2 className="spin" size={17} /> : <Scissors size={17} />}
        Remove background
      </button>
      <CollapsibleSection title="Settings" defaultOpen={false}>
        <div className="node-note node-note-compact">
          FAL · Bria RMBG 2.0 · PNG alpha output
        </div>
      </CollapsibleSection>
      {model.data.message ? <div className="node-note node-note-compact">{model.data.message}</div> : null}
    </>
  );
}
