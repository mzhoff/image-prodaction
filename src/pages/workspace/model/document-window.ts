/** Creation choosers remain in Workspace; document sessions get the whole window. */
export function isDocumentWindow(pathname: string, params: Pick<URLSearchParams, 'get'>): boolean {
  if (/^\/stories\/(?:timelines\/)?[^/]+\/?$/.test(pathname)) return true;
  if (/^\/chats\/[^/]+\/?$/.test(pathname)) return true;
  if (pathname === '/' && ['image', 'video', 'text', 'storyboard'].includes(params.get('create') ?? '')) return true;
  if (pathname !== '/create') return false;
  const type = params.get('type') ?? 'image';
  return ['image', 'video', 'text', 'flow', 'storyboard'].includes(type) || (['timeline', 'storyboard'].includes(type) && Boolean(params.get('document') || params.get('preset')));
}

/** Only return to a product screen, never to an external URL or another editor. */
export function workspaceReturnHref(value: string | null): string {
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  const url = new URL(value, 'https://workspace.local');
  if (!['/', '/create', '/stories', '/chats', '/flows', '/folders', '/library', '/pipelines', '/playground', '/trash', '/usage'].includes(url.pathname) && !/^\/folders\/[^/]+$/.test(url.pathname)) return '/';
  return isDocumentWindow(url.pathname, url.searchParams) ? '/' : `${url.pathname}${url.search}`;
}
