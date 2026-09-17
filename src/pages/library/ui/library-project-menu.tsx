'use client';

import { Input as PuiInput } from '@prodactionpro/ui-core/input';

import { FolderInput, Search } from '@prodactionpro/ui-core/icons';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEventCallback } from '@/shared/lib/use-event-callback';
import { FLOATING_CONTEXT_MENU_CLOSE_EVENT } from '@/shared/ui/floating-context-menu';
import { useWorkspaceShell } from '@/pages/workspace/ui/workspace-shell-context';
import { projectMenuPosition, type ProjectMenuRect } from '../lib/project-menu-position';

export type ProjectMenuAnchor = HTMLElement | ProjectMenuRect;
export const LIBRARY_PROJECT_MENU_ID = 'library-project-menu-options';

export function LibraryProjectMenu({ anchor, workspaceId, onClose, onSelect }: {
  anchor: ProjectMenuAnchor;
  workspaceId: string;
  onClose: () => void;
  onSelect: (projectId: string) => void;
}) {
  const workspace = useWorkspaceShell();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const focusedOnce = useRef(false);
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState<ReturnType<typeof projectMenuPosition> | null>(null);
  const projects = workspace.projects.filter((project) => project.status === 'active'
    && project.workspaceId === workspaceId
    && project.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const close = useEventCallback((restoreFocus = false) => {
    onClose();
    if (restoreFocus && anchor instanceof HTMLElement && anchor.isConnected) anchor.focus({ preventScroll: true });
  });
  const updatePosition = useEventCallback(() => {
    const menu = rootRef.current;
    if (!menu) return;
    if (anchor instanceof HTMLElement && !anchor.isConnected) { close(); return; }
    const rect = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : anchor;
    const list = menu.querySelector<HTMLElement>('.library-project-list');
    const contentHeight = menu.scrollHeight + (list ? list.scrollHeight - list.clientHeight : 0) + 2;
    const next = projectMenuPosition(rect, { width: window.innerWidth, height: window.innerHeight }, contentHeight);
    setPosition((previous) => previous && Object.keys(next).every((key) => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
  });

  useLayoutEffect(() => {
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    if (rootRef.current) observer.observe(rootRef.current);
    if (anchor instanceof HTMLElement) observer.observe(anchor);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.visualViewport?.addEventListener('resize', updatePosition);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePosition);
    };
  }, [anchor, updatePosition]);
  useLayoutEffect(() => { updatePosition(); }, [search, projects.length, workspace.error, updatePosition]);
  useLayoutEffect(() => {
    if (!position || focusedOnce.current) return;
    searchRef.current?.focus({ preventScroll: true });
    focusedOnce.current = true;
  }, [position]);
  useEffect(() => {
    const outside = (event: Event) => {
      const target = event.target as Node | null;
      if (rootRef.current?.contains(target) || (anchor instanceof HTMLElement && anchor.contains(target))) return;
      close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Own Escape before the fullscreen viewer's global listener sees it.
      event.preventDefault(); event.stopImmediatePropagation(); close(true);
    };
    const dismiss = () => close();
    // Dismiss after the click, so the parent viewer can recognize an open
    // floating menu and avoid treating the same gesture as "close viewer".
    document.addEventListener('click', outside);
    document.addEventListener('focusin', outside);
    window.addEventListener('keydown', escape, true);
    document.addEventListener(FLOATING_CONTEXT_MENU_CLOSE_EVENT, dismiss);
    return () => {
      document.removeEventListener('click', outside);
      document.removeEventListener('focusin', outside);
      window.removeEventListener('keydown', escape, true);
      document.removeEventListener(FLOATING_CONTEXT_MENU_CLOSE_EVENT, dismiss);
    };
  }, [anchor, close]);

  return createPortal(
    <div ref={rootRef} className="context-menu library-project-menu" role="region" aria-label="Отправить в проект"
      data-floating-context-menu="true" data-placement={position?.placement}
      style={{ left: position?.left, top: position?.top, width: position?.width, maxHeight: position?.maxHeight, visibility: position ? 'visible' : 'hidden' }}
      onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        const buttons = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length : (index <= 0 ? buttons.length - 1 : index - 1);
          buttons[next]?.focus({ preventScroll: true }); buttons[next]?.scrollIntoView({ block: 'nearest' });
        } else if (event.key === 'Enter' && event.target === searchRef.current) {
          event.preventDefault(); buttons[0]?.click();
        } else if ((event.key === 'Home' || event.key === 'End') && index >= 0) {
          event.preventDefault(); buttons[event.key === 'Home' ? 0 : buttons.length - 1]?.focus();
        }
      }}>
      <label className="library-project-search"><Search size={16} /><PuiInput ref={searchRef} type="search"
        aria-label="Найти проект" placeholder="Найти проект" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <div className="library-project-menu-label">Отправить в проект</div>
      <div className="library-project-list" id={LIBRARY_PROJECT_MENU_ID} role="menu" aria-label="Проекты">
        {workspace.error ? <p role="alert">Не удалось обновить список. <button type="button" onClick={() => void workspace.refresh()}>Повторить</button></p> : null}
        {!workspace.hydrated ? <p>Загружаем проекты…</p> : null}
        {workspace.hydrated && !projects.length ? <p role="status">{search ? 'Проекты не найдены.' : 'Нет доступных проектов в этом рабочем пространстве.'}</p> : null}
        {projects.map((project) => <button key={project.id} type="button" role="menuitem" className="context-menu-item"
          title={project.name} onClick={() => onSelect(project.id)}><FolderInput size={16} /><span className="context-menu-label">{project.name}</span></button>)}
      </div>
    </div>, document.body,
  );
}
