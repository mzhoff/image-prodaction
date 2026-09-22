export type AnalyticsPage = { path: string; title: string; screen: string };

const PAGES: Record<string, string> = {
  '/login': 'login', '/register': 'register', '/onboarding': 'onboarding', '/create': 'create', '/stories': 'stories',
  '/': 'home', '/flows': 'flows', '/editor': 'editor', '/library': 'library', '/pipelines': 'pipelines',
  '/playground': 'playground', '/usage': 'usage', '/trash': 'trash', '/account': 'account',
};
const SETTINGS = new Set(['account', 'security', 'providers', 'integrations']);

export function analyticsPage(pathname: string): AnalyticsPage | null {
  const path = pathname.split(/[?#]/, 1)[0];
  if (Object.hasOwn(PAGES, path)) return { path, title: `Image Production · ${PAGES[path]}`, screen: PAGES[path] };
  if (/^\/projects\/[^/]+\/?$/.test(path)) {
    return { path: '/projects/:document', title: 'Image Production · editor', screen: 'editor' };
  }
  if (/^\/library\/[^/]+\/?$/.test(path)) {
    return { path: '/library/:asset', title: 'Image Production · asset', screen: 'asset' };
  }
  if (path.startsWith('/settings/') && SETTINGS.has(path.slice('/settings/'.length))) {
    return { path, title: 'Image Production · settings', screen: 'settings' };
  }
  // Callback, token, API and unknown routes and embedded external destinations are never hits.
  return null;
}
