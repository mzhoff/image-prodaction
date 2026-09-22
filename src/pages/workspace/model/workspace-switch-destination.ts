/** Never carry a document, chat or folder identifier into another workspace. */
export function workspaceSwitchDestination(pathname: string | null): string {
  const path = pathname ?? '/';
  if (path === '/') return '/';
  for (const section of ['/stories', '/folders', '/library', '/chats', '/usage']) {
    if (path === section || path.startsWith(`${section}/`)) return section;
  }
  return '/flows';
}
