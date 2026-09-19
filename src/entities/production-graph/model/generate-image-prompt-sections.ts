import { normalizeTextSectionFilterId, parseTextSectionSegments, textSectionSegmentToText } from './text-section-filters';

export const GENERATE_PROMPT_SECTION_PREFIX = 'prompt-section:';
export interface GeneratePromptSection { id: string; label: string }
export interface GeneratePromptRoute { sectionId?: string; requireSection?: boolean; label?: string; omitSectionIds?: string[] }

export function getGeneratePromptSectionPortId(label: string) {
  return `${GENERATE_PROMPT_SECTION_PREFIX}${encodeURIComponent(normalizeTextSectionFilterId(label))}`;
}

export function getGeneratePromptSectionId(portId: string) {
  if (!portId.startsWith(GENERATE_PROMPT_SECTION_PREFIX)) return null;
  try { return decodeURIComponent(portId.slice(GENERATE_PROMPT_SECTION_PREFIX.length)) || null; }
  catch { return null; }
}

// Shared by the canvas request builder and the executable image handler.
export function routeGeneratePromptText(text: string, route?: GeneratePromptRoute) {
  if (!route) return text;
  const segments = parseTextSectionSegments(text);
  if (route.sectionId) {
    const matches = segments.filter((segment) => segment.id === route.sectionId);
    if (matches.length) return matches.map(textSectionSegmentToText).join('\n\n');
    if (route.requireSection) return '';
    // A manually connected plain-text source supplies the entire section.
    return text.trim() ? `[${route.label ?? route.sectionId}]\n${text.trim()}` : '';
  }
  const omitted = new Set(route.omitSectionIds);
  return segments.filter((segment) => !segment.id || !omitted.has(segment.id))
    .map(textSectionSegmentToText).join('\n\n');
}
