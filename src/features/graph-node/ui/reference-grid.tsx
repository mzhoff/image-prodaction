'use client';

import { ImageUp, Trash2 } from 'lucide-react';
import { useAssetUrl } from '@/entities/production-graph/model/use-asset-url';

export interface NodeReferenceGridItem {
  assetId: string;
  edgeId?: string;
}

export function NodeReferenceGrid({
  ariaLabel,
  altPrefix,
  items,
  onRemove,
}: {
  ariaLabel: string;
  altPrefix: string;
  items: NodeReferenceGridItem[];
  onRemove: (assetId: string, edgeId?: string) => void;
}) {
  const visibleItems = items.slice(0, 4);
  const extraCount = Math.max(0, items.length - 4);
  const cells = Array.from({ length: 4 }, (_, index) => visibleItems[index]);

  return (
    <div className="entity-reference-grid" aria-label={ariaLabel} data-node-interactive>
      {cells.map((item, index) => (
        <NodeReferenceCell
          altPrefix={altPrefix}
          key={item?.assetId ?? `empty-${index}`}
          item={item}
          extraCount={index === 3 ? extraCount : 0}
          index={index}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

function NodeReferenceCell({
  altPrefix,
  extraCount,
  index,
  item,
  onRemove,
}: {
  altPrefix: string;
  extraCount: number;
  index: number;
  item?: NodeReferenceGridItem;
  onRemove: (assetId: string, edgeId?: string) => void;
}) {
  const url = useAssetUrl(item?.assetId);

  return (
    <div className="entity-reference-cell">
      {url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`${altPrefix} ${index + 1}`} draggable={false} />
          <button
            type="button"
            className="entity-reference-remove"
            aria-label={`Remove ${altPrefix.toLowerCase()}`}
            title="Remove reference"
            onClick={(event) => {
              event.stopPropagation();
              if (item) onRemove(item.assetId, item.edgeId);
            }}
            data-node-interactive
          >
            <Trash2 size={14} />
          </button>
        </>
      ) : (
        <div className="entity-reference-empty">
          <ImageUp size={15} />
        </div>
      )}
      {extraCount > 0 ? <span className="entity-reference-extra">+{extraCount}</span> : null}
    </div>
  );
}
