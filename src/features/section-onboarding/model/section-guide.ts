export type SectionGuideId = 'usage' | 'home' | 'flows' | 'canvas' | 'playground' | 'library' | 'stories' | 'timeline' | 'projects' | 'chats' | 'settings';
export const SECTION_GUIDE_VERSION = 1;

export function sectionGuideForRoute(path: string, mode: string | null, view: string | null): SectionGuideId | null {
  if (path === '/usage') return 'usage';
  if (path === '/playground' || path.startsWith('/playground/')) return 'playground';
  if (path === '/' || path === '/create') {
    if (mode === 'storyboard') return 'stories';
    if (mode === 'timeline') return 'timeline';
    if (mode === 'flow') return 'canvas';
    return 'home';
  }
  if (path.startsWith('/stories/timelines/') || (path === '/stories' && view === 'timeline')) return 'timeline';
  if (path.startsWith('/stories')) return 'stories';
  if (path.startsWith('/library')) return 'library';
  if (path.startsWith('/folders')) return 'projects';
  if (path.startsWith('/chats')) return 'chats';
  if (path.startsWith('/settings')) return 'settings';
  if (/^\/projects\/[^/]+\/?$/.test(path)) return 'canvas';
  if (/^\/(flows|projects|pipelines)(\/|$)/.test(path)) return 'flows';
  return null;
}

export function sectionGuideStorageKey(userId: string, section: SectionGuideId, version = SECTION_GUIDE_VERSION) {
  return `reverie:section-guide:${encodeURIComponent(userId)}:${section}:v${version}`;
}
