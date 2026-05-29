'use client';

import { parseLayerSections } from '@/entities/production-graph/model/layer-text-parser';

interface ExtractLayerTagsProps {
  text?: string;
}

export function ExtractLayerTags({ text }: ExtractLayerTagsProps) {
  const layers = Array.from(new Map(parseLayerSections(text).map((layer) => [layer.layerId, layer])).values());
  if (layers.length === 0) return null;

  return (
    <div className="extract-layer-tags" aria-label="Extracted layers">
      {layers.map((layer) => (
        <span className="extract-layer-tag" key={`${layer.layerId}-${layer.label}`}>
          {layer.label}
        </span>
      ))}
    </div>
  );
}
