'use client';

import { productionLayerTextSectionParseOptions } from '@/entities/production-graph/model/layer-text-parser';
import type { ProductionLayerId } from '@/entities/production-graph/model/production-layers';
import { TextSectionResultBox } from './text-section-result-box';

interface ExtractResultBoxProps {
  disabledLayerIds?: ProductionLayerId[];
  onChange?: (value: string) => void;
  value?: string;
}

export function ExtractResultBox({ disabledLayerIds = [], onChange, value }: ExtractResultBoxProps) {
  return (
    <TextSectionResultBox
      ariaLabel="Extract result"
      className="extract-result-box"
      disabledFilterIds={disabledLayerIds}
      onChange={onChange}
      parseOptions={productionLayerTextSectionParseOptions}
      value={value}
    />
  );
}
