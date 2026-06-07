'use client';

import { useCallback, useMemo } from 'react';
import {
  getTextSectionDuplicateIssues,
  normalizeTextSectionFilterIds,
  parseTextSectionFilters,
  type ParseTextSectionOptions,
} from '@/entities/production-graph/model/text-section-filters';

interface UseTextSectionFiltersOptions {
  disabledFilterIds?: string[];
  onDisabledFilterIdsChange: (filterIds: string[]) => void;
  parseOptions?: ParseTextSectionOptions;
  text?: string;
}

export function useTextSectionFilters({
  disabledFilterIds,
  onDisabledFilterIdsChange,
  parseOptions,
  text,
}: UseTextSectionFiltersOptions) {
  const filters = useMemo(() => parseTextSectionFilters(text, parseOptions), [parseOptions, text]);
  const filterIds = useMemo(() => new Set(filters.map((filter) => filter.id)), [filters]);
  const normalizedDisabledFilterIds = useMemo(() => (
    normalizeTextSectionFilterIds(disabledFilterIds).filter((filterId) => filterIds.has(filterId))
  ), [disabledFilterIds, filterIds]);
  const duplicateIssues = useMemo(() => getTextSectionDuplicateIssues(text, parseOptions), [parseOptions, text]);

  const toggleFilter = useCallback((filterId: string) => {
    const disabled = new Set(normalizedDisabledFilterIds);
    if (disabled.has(filterId)) {
      disabled.delete(filterId);
    } else {
      disabled.add(filterId);
    }
    onDisabledFilterIdsChange(Array.from(disabled));
  }, [normalizedDisabledFilterIds, onDisabledFilterIdsChange]);

  return {
    disabledFilterIds: normalizedDisabledFilterIds,
    duplicateIssues,
    filters,
    toggleFilter,
  };
}
