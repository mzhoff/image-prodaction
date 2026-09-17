'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { BarChart3, ChevronRight, Folder, GalleryVerticalEnd, Images, Route, Trash2, Users } from '@prodactionpro/ui-core/icons';
import { useWorkspaceShell } from './workspace-shell-context';

export function WorkspaceNavigation({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname() ?? '/';
  const query = useSearchParams();
  const section = query?.get('section');
  const workspace = useWorkspaceShell();
  const folders = workspace.folders.filter((folder) => folder.workspaceId === workspace.activeWorkspace?.id);
  const [expanded, setExpanded] = useState({ files: true, library: true });
  const library = pathname.startsWith('/library');
  const items = [
    { id: 'files' as const, href: '/', label: 'My Files', icon: GalleryVerticalEnd, active: pathname === '/', children: [
      { href: '/', label: 'Все файлы', active: pathname === '/' && !query?.get('scope') && !query?.get('folderId') },
      { href: '/?scope=projects', label: 'Проекты', active: pathname === '/' && query?.get('scope') === 'projects' },
      ...folders.map((folder) => ({ href: `/?folderId=${folder.id}`, label: folder.name,
        active: pathname === '/' && query?.get('folderId') === folder.id })),
    ] },
    { id: 'library' as const, href: '/library', label: 'Library', icon: Images, active: library, children: [
      { href: '/library?mediaKind=image', label: 'Изображения', active: library && !section && !query?.get('folderId') && query?.get('mediaKind') === 'image', icon: Images },
      { href: '/library?section=pipelines', label: 'Пайплайны', active: library && section === 'pipelines', icon: Route },
      { href: '/library?section=subjects', label: 'Персонажи', active: library && section === 'subjects', icon: Users },
      { href: '/library?section=projects', label: 'По проектам', active: library && section === 'projects', icon: Folder },
      ...folders.map((folder) => ({ href: `/library?folderId=${folder.id}`, label: folder.name,
        active: library && !section && query?.get('folderId') === folder.id })),
    ] },
  ];
  return <nav className="workspace-nav" aria-label="Studio">
    {items.map((item) => <div key={item.id} className="workspace-nav-group">
      <div className={`workspace-nav-parent ${item.active ? 'workspace-nav-item-active' : ''}`}>
        <Link className="workspace-nav-item" href={item.href} aria-label={collapsed ? item.label : undefined} title={collapsed ? item.label : undefined}>
          <item.icon size={16} /><span>{item.label}</span>
        </Link>
        {!collapsed ? <button type="button" aria-label={`${expanded[item.id] ? 'Свернуть' : 'Развернуть'} ${item.label}`}
          aria-expanded={expanded[item.id]} aria-controls={`nav-${item.id}`} onClick={() => setExpanded((state) => ({ ...state, [item.id]: !state[item.id] }))}>
          <ChevronRight size={14} style={{ transform: expanded[item.id] ? 'rotate(90deg)' : undefined }} />
        </button> : null}
      </div>
      {!collapsed && expanded[item.id] ? <div className="workspace-nav-children" id={`nav-${item.id}`}>
        {item.children.map((child) => <Link key={child.href} href={child.href} title={child.label}
          className={`workspace-nav-child ${child.active ? 'workspace-nav-item-active' : ''}`} aria-current={child.active ? 'page' : undefined}>{child.label}</Link>)}
      </div> : null}
    </div>)}
    {[{ href: '/pipelines', label: 'Pipelines', icon: Route }, { href: '/usage', label: 'Usage', icon: BarChart3 }, { href: '/trash', label: 'Trash', icon: Trash2 }].map((item) =>
      <Link key={item.href} href={item.href} className={`workspace-nav-item ${pathname.startsWith(item.href) ? 'workspace-nav-item-active' : ''}`}
        aria-current={pathname.startsWith(item.href) ? 'page' : undefined} title={collapsed ? item.label : undefined}>
        <item.icon size={16} /><span>{item.label}</span>
      </Link>)}
  </nav>;
}
