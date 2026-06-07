export interface TextSectionFilter {
  duplicate: boolean;
  header: string;
  id: string;
  label: string;
  start: number;
  text: string;
}

export interface TextSectionDuplicateIssue {
  duplicateOfStart: number;
  header: string;
  id: string;
  label: string;
  start: number;
}

export interface TextSectionSegment {
  duplicate?: boolean;
  header?: string;
  id?: string;
  label?: string;
  start: number;
  text: string;
  type: 'plain' | 'section';
}

export interface ParseTextSectionOptions {
  cleanupSectionText?: (value: string) => string;
  resolveSectionId?: (header: string) => string | null;
}

const sectionHeaderPattern = /^[^\S\r\n]*\[([^\]\r\n]+)][^\S\r\n]*$/gm;

export function parseTextSectionSegments(value?: string, options: ParseTextSectionOptions = {}): TextSectionSegment[] {
  if (!value?.trim()) return [];

  const matches = Array.from(value.matchAll(sectionHeaderPattern));
  if (matches.length === 0) return [{ start: 0, text: value.trim(), type: 'plain' }];

  const segments: TextSectionSegment[] = [];
  const seen = new Map<string, number>();
  let cursor = 0;

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    if (match.index === undefined) continue;

    const rawHeader = (match[1] ?? '').trim();
    const sectionId = getSectionId(rawHeader, options);
    if (!sectionId) continue;

    const plainText = value.slice(cursor, match.index).trim();
    if (plainText) segments.push({ start: cursor, text: plainText, type: 'plain' });

    const nextMatch = matches[index + 1];
    const contentStart = match.index + match[0].length;
    const contentEnd = nextMatch?.index ?? value.length;
    const sectionText = cleanupSectionText(value.slice(contentStart, contentEnd), options);
    const duplicate = seen.has(sectionId);
    if (!duplicate) seen.set(sectionId, match.index);

    segments.push({
      duplicate,
      header: `[${rawHeader}]`,
      id: sectionId,
      label: rawHeader,
      start: match.index,
      text: sectionText,
      type: 'section',
    });
    cursor = contentEnd;
  }

  const tail = value.slice(cursor).trim();
  if (tail) segments.push({ start: cursor, text: tail, type: 'plain' });

  return segments;
}

export function parseTextSectionFilters(value?: string, options: ParseTextSectionOptions = {}) {
  return parseTextSectionSegments(value, options)
    .filter((segment): segment is TextSectionSegment & Required<Pick<TextSectionSegment, 'header' | 'id' | 'label'>> => (
      segment.type === 'section' && Boolean(segment.id && segment.label && !segment.duplicate)
    ))
    .map((segment): TextSectionFilter => ({
      duplicate: false,
      header: segment.header,
      id: segment.id,
      label: segment.label,
      start: segment.start,
      text: segment.text,
    }));
}

export function getTextSectionDuplicateIssues(value?: string, options: ParseTextSectionOptions = {}) {
  const firstStarts = new Map<string, number>();
  return parseTextSectionSegments(value, options).reduce<TextSectionDuplicateIssue[]>((issues, segment) => {
    if (segment.type !== 'section' || !segment.id || !segment.label || !segment.header) return issues;
    if (!segment.duplicate) {
      firstStarts.set(segment.id, segment.start);
      return issues;
    }

    issues.push({
      duplicateOfStart: firstStarts.get(segment.id) ?? segment.start,
      header: segment.header,
      id: segment.id,
      label: segment.label,
      start: segment.start,
    });
    return issues;
  }, []);
}

export function getFilteredTextSectionText(
  value: string | undefined,
  disabledSectionIds: string[] | undefined,
  options: ParseTextSectionOptions = {},
) {
  if (!value?.trim()) return '';

  const disabled = new Set(normalizeTextSectionFilterIds(disabledSectionIds));
  if (disabled.size === 0) return value.trim();

  return parseTextSectionSegments(value, options)
    .filter((segment) => segment.type !== 'section' || segment.duplicate || !segment.id || !disabled.has(segment.id))
    .map(textSectionSegmentToText)
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

export function normalizeTextSectionFilterIds(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? normalizeTextSectionFilterId(item) : '')).filter(Boolean)
    : [];
}

export function normalizeTextSectionFilterId(value: string) {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

export function textSectionSegmentToText(segment: TextSectionSegment) {
  if (segment.type === 'plain') return segment.text.trim();
  return [segment.header, segment.text].filter(Boolean).join('\n').trim();
}

function getSectionId(header: string, options: ParseTextSectionOptions) {
  const resolvedId = options.resolveSectionId
    ? options.resolveSectionId(header)
    : normalizeTextSectionFilterId(header);
  return resolvedId ? normalizeTextSectionFilterId(resolvedId) : null;
}

function cleanupSectionText(value: string, options: ParseTextSectionOptions) {
  const trimmed = value.trim();
  return options.cleanupSectionText ? options.cleanupSectionText(trimmed) : trimmed;
}
