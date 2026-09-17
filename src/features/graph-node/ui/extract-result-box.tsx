'use client';

import { extractLayerTextSectionParseOptions } from '@/entities/production-graph/model/extract-layer-parser';
import type { ExtractLayerId } from '@/entities/production-graph/model/extract-analysis-profiles';
import { TextSectionResultBox } from './text-section-result-box';

interface ExtractResultBoxProps {
  disabledLayerIds?: ExtractLayerId[];
  onChange?: (value: string) => void;
  value?: string;
}

export function ExtractResultBox({ disabledLayerIds = [], onChange, value }: ExtractResultBoxProps) {
  return (
    <TextSectionResultBox
      textField="result"
      ariaLabel="Extract result"
      className="extract-result-box"
      disabledFilterIds={disabledLayerIds}
      onChange={onChange}
      parseOptions={extractLayerTextSectionParseOptions}
      value={value}
    />
  );
}
