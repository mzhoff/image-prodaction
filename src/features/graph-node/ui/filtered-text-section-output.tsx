'use client';

import { useState } from 'react';
import type { TextSectionDuplicateIssue } from '@/entities/production-graph/model/text-section-filters';
import { TextSectionDuplicateWarnings, TextSectionFilterTags } from './text-section-filter-tags';
import { TextSectionResultBox } from './text-section-result-box';

interface FilteredTextSectionOutputProps {
  ariaLabel?: string;
  boxClassName?: string;
  disabledFilterIds?: string[];
  issues?: TextSectionDuplicateIssue[];
  onChange?: (value: string) => void;
  onToggle?: (filterId: string) => void;
  readOnly?: boolean;
  tagsClassName?: string;
  value?: string;
}

export function FilteredTextSectionOutput({
  ariaLabel,
  boxClassName,
  disabledFilterIds = [],
  issues = [],
  onChange,
  onToggle,
  readOnly = false,
  tagsClassName,
  value,
}: FilteredTextSectionOutputProps) {
  const [scrollTargetStart, setScrollTargetStart] = useState<number | null>(null);

  return (
    <>
      <TextSectionFilterTags
        className={tagsClassName}
        disabledFilterIds={disabledFilterIds}
        onToggle={onToggle}
        text={value}
      />
      <TextSectionResultBox
        ariaLabel={ariaLabel}
        className={boxClassName}
        disabledFilterIds={disabledFilterIds}
        onChange={onChange}
        readOnly={readOnly}
        scrollToStart={scrollTargetStart}
        value={value}
      />
      <TextSectionDuplicateWarnings
        issues={issues}
        onSelectIssue={(issue) => {
          setScrollTargetStart(null);
          window.requestAnimationFrame(() => setScrollTargetStart(issue.start));
        }}
      />
    </>
  );
}
