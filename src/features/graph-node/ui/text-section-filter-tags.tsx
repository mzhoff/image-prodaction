'use client';

import {
  getTextSectionDuplicateIssues,
  parseTextSectionFilters,
  type ParseTextSectionOptions,
  type TextSectionDuplicateIssue,
} from '@/entities/production-graph/model/text-section-filters';
import { cn } from '@/shared/lib/cn';

interface TextSectionFilterTagsProps {
  readOnly?: boolean;
  textField?: string;
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
  readOnly = false,
  textField,
  className,
  disabledFilterIds = [],
  onToggle,
  parseOptions,
  text,
}: TextSectionFilterTagsProps) {
  const filters = parseTextSectionFilters(text, parseOptions);
  const plainEnd = filters[0]?.start ?? text?.length ?? 0;
  const hasPlainText = Boolean(textField && text?.slice(0, plainEnd).trim());
  if (filters.length === 0 && !hasPlainText) return null;
  const disabled = new Set(disabledFilterIds);

  return (
    <div className={cn('text-section-filter-tags', className)} aria-label="Text section filters">
      {hasPlainText ? <button type="button" className="text-section-filter-tag"
        data-node-interactive data-text-field={textField} data-text-fragment-handle
        data-text-range-start={0} data-text-range-end={plainEnd}
        data-text-readonly={readOnly || undefined}
        aria-label="Перетащить свободный текст" title="Перетащи текст на канвас или в другое поле. Alt — копировать.">
        TEXT
      </button> : null}
      {filters.map((filter) => (
        <button
          type="button"
          className={cn('text-section-filter-tag', disabled.has(filter.id) && 'text-section-filter-tag-muted')}
          aria-pressed={!disabled.has(filter.id)}
          key={`${filter.id}-${filter.start}`}
          data-node-interactive
          data-text-fragment-handle={textField ? '' : undefined}
          data-text-field={textField}
          data-text-section-label={filter.label}
          data-text-range-start={filter.start}
          data-text-readonly={readOnly || undefined}
          title={textField ? 'Перетащи блок на канвас или в текст. Alt — копировать.' : undefined}
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
