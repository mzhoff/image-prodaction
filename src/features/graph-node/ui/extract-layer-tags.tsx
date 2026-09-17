'use client';

import { extractLayerTextSectionParseOptions } from '@/entities/production-graph/model/extract-layer-parser';
import type { ExtractLayerId } from '@/entities/production-graph/model/extract-analysis-profiles';
import { TextSectionFilterTags } from './text-section-filter-tags';

interface ExtractLayerTagsProps {
  disabledLayerIds?: ExtractLayerId[];
  onToggle?: (layerId: ExtractLayerId) => void;
  text?: string;
}

export function ExtractLayerTags({ disabledLayerIds = [], onToggle, text }: ExtractLayerTagsProps) {
  return (
    <TextSectionFilterTags
      textField="result"
      className="extract-layer-tags"
      disabledFilterIds={disabledLayerIds}
      onToggle={(filterId) => onToggle?.(filterId as ExtractLayerId)}
      parseOptions={extractLayerTextSectionParseOptions}
      text={text}
    />
  );
}
