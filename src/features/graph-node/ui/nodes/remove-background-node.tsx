'use client';

import { Loader2, Scissors } from 'lucide-react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { PrimaryActionButton } from '@/shared/ui/primary-action-button';
import { useRemoveBackgroundNodeModel } from '../../model/use-remove-background-node-model';
import { ImagePlate } from '../image-plate';
import { NodeTitle } from '../node-title';

export function RemoveBackgroundNode({ node }: { node: ProductionNode }) {
  const model = useRemoveBackgroundNodeModel(node);

  return (
    <>
      <NodeTitle title={node.data.title} nodeType={node.type} muted />
      <ImagePlate assetId={model.displayAsset?.id} />
      <PrimaryActionButton
        icon={model.processing ? <Loader2 className="spin" size={17} /> : <Scissors size={17} />}
        onClick={model.handleRemoveBackground}
        disabled={!model.sourceAsset || model.processing}
      >
        Remove background
      </PrimaryActionButton>
      <CollapsibleSection title="Settings" defaultOpen={false}>
        <div className="node-note node-note-compact">
          FAL · Bria RMBG 2.0 · PNG alpha output
        </div>
      </CollapsibleSection>
      {model.data.message ? <div className="node-note node-note-compact">{model.data.message}</div> : null}
    </>
  );
}
