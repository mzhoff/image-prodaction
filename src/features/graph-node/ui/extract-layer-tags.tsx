'use client';

import { productionLayerTextSectionParseOptions } from '@/entities/production-graph/model/layer-text-parser';
import type { ProductionLayerId } from '@/entities/production-graph/model/production-layers';
import { TextSectionFilterTags } from './text-section-filter-tags';

interface ExtractLayerTagsProps {
  disabledLayerIds?: ProductionLayerId[];
  onToggle?: (layerId: ProductionLayerId) => void;
  text?: string;
}

export function ExtractLayerTags({ disabledLayerIds = [], onToggle, text }: ExtractLayerTagsProps) {
  return (
    <TextSectionFilterTags
      className="extract-layer-tags"
      disabledFilterIds={disabledLayerIds}
      onToggle={(filterId) => onToggle?.(filterId as ProductionLayerId)}
      parseOptions={productionLayerTextSectionParseOptions}
      text={text}
    />
  );
}
