'use client';

import {
  getTextSectionDuplicateIssues,
  parseTextSectionFilters,
  type ParseTextSectionOptions,
  type TextSectionDuplicateIssue,
} from '@/entities/production-graph/model/text-section-filters';
import { cn } from '@/shared/lib/cn';

interface TextSectionFilterTagsProps {
  className?: string;
  disabledFilterIds?: string[];
  onToggle?: (filterId: string) => void;
  parseOptions?: ParseTextSectionOptions;
  text?: string;
}

interface TextSectionDuplicateWarningsProps {
  className?: string;
  issues: TextSectionDuplicateIssue[];
  onSelectIssue?: (issue: TextSectionDuplicateIssue) => void;
}

export function TextSectionFilterTags({
  className,
  disabledFilterIds = [],
  onToggle,
  parseOptions,
  text,
}: TextSectionFilterTagsProps) {
  const filters = parseTextSectionFilters(text, parseOptions);
  if (filters.length === 0) return null;
  const disabled = new Set(disabledFilterIds);

  return (
    <div className={cn('text-section-filter-tags', className)} aria-label="Text section filters">
      {filters.map((filter) => (
        <button
          type="button"
          className={cn('text-section-filter-tag', disabled.has(filter.id) && 'text-section-filter-tag-muted')}
          aria-pressed={!disabled.has(filter.id)}
          key={`${filter.id}-${filter.start}`}
          data-node-interactive
          onClick={() => onToggle?.(filter.id)}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}

export function TextSectionDuplicateWarnings({
  className,
  issues,
  onSelectIssue,
}: TextSectionDuplicateWarningsProps) {
  if (issues.length === 0) return null;

  return (
    <div className={cn('text-section-filter-warnings', className)}>
      {issues.map((issue) => (
        <button
          type="button"
          key={`${issue.id}-${issue.start}`}
          className="text-section-filter-warning"
          data-node-interactive
          onClick={() => onSelectIssue?.(issue)}
        >
          Неуникальное имя фильтра {issue.header}. Переименуй этот блок, чтобы он стал отдельным фильтром.
        </button>
      ))}
    </div>
  );
}

export function getTextSectionDuplicateWarnings(text: string | undefined, parseOptions?: ParseTextSectionOptions) {
  return getTextSectionDuplicateIssues(text, parseOptions);
}
