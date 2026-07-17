'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GalleryVerticalEnd,
  Images,
  PanelLeftClose,
  Route,
  Trash2,
} from 'lucide-react';
import { signOut, useSession } from '@/shared/auth/client';
import { BrandSelect } from '@/shared/ui/brand-select';
import { AssistantFloatingButton } from '@/shared/ui/assistant-floating-button';
import { AssistantShell } from '@/widgets/assistant-shell/ui/assistant-shell';
import { useWorkspaceProjects } from '../model/use-workspace-projects';
import { WorkspaceShellContext } from './workspace-shell-context';

const navItems = [
  { href: '/', icon: GalleryVerticalEnd, id: 'my-files', label: 'My Files' },
  { href: '/library', icon: Images, id: 'library', label: 'Library' },
  { href: '/?section=pipelines', icon: Route, id: 'pipelines', label: 'Pipelines' },
  { href: '/?section=trash', icon: Trash2, id: 'trash', label: 'Trash' },
] as const;

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const workspace = useWorkspaceProjects();
  const { data: session } = useSession();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const currentPath = pathname ?? '/';
  const activeNav = currentPath.startsWith('/library')
    ? 'library'
    : searchParams?.get('section') === 'trash'
      ? 'trash'
      : searchParams?.get('section') === 'pipelines'
        ? 'pipelines'
        : 'my-files';
  const workspaceOptions = useMemo(() => (
    workspace.activeWorkspace
      ? [{ value: workspace.activeWorkspace.id, label: workspace.activeWorkspace.name }]
      : [{ value: '', label: 'Workspace загружается…' }]
  ), [workspace.activeWorkspace]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const closeProfileMenu = (event: MouseEvent) => {
      if (profileMenuRef.current?.contains(event.target as Node)) return;
      setProfileMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileMenuOpen(false);
    };

    window.addEventListener('mousedown', closeProfileMenu);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('mousedown', closeProfileMenu);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [profileMenuOpen]);

  return (
    <WorkspaceShellContext.Provider value={workspace}>
      <main className="workspace-page">
        <aside className="workspace-sidebar" aria-label="Workspace navigation">
          <div className="workspace-sidebar-top">
            <div className="workspace-logo-row">
              <Link className="workspace-logo" href="/" aria-label="Reverie home">
                <img className="workspace-logo-default" src="/brand/reverie-logo-default.webp" alt="" />
                <img className="workspace-logo-hover" src="/brand/reverie-logo-hover.webp" alt="" />
              </Link>
              <button className="workspace-icon-button" type="button" aria-label="Collapse sidebar">
                <PanelLeftClose size={14} />
              </button>
            </div>
            <nav className="workspace-nav" aria-label="Studio">
              {navItems.map((item) => (
                <Link
                  className={`workspace-nav-item ${activeNav === item.id ? 'workspace-nav-item-active' : ''}`}
                  href={item.href}
                  key={item.id}
                  aria-current={activeNav === item.id ? 'page' : undefined}
                >
                  <item.icon size={16} />
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
          </div>

          <div className="workspace-profile-area" ref={profileMenuRef}>
            <button
              aria-expanded={profileMenuOpen}
              aria-haspopup="menu"
              className="workspace-user"
              onClick={() => setProfileMenuOpen((open) => !open)}
              type="button"
            >
              <img src={session?.user.image || '/workspace-assets/avatar-john.png'} alt="" />
              <span>{session?.user.name || 'Your account'}</span>
            </button>
            {profileMenuOpen ? (
              <div className="workspace-profile-menu" role="menu">
                <div className="workspace-profile-menu-user">
                  <img src={session?.user.image || '/workspace-assets/avatar-john.png'} alt="" />
                  <div>
                    <strong>{session?.user.name || 'Your account'}</strong>
                    <span>{session?.user.email || ''}</span>
                  </div>
                </div>
                <Link
                  href="/settings/account"
                  role="menuitem"
                  onClick={() => setProfileMenuOpen(false)}
                >
                  Account settings
                </Link>
                <Link
                  href="/settings/providers"
                  role="menuitem"
                  onClick={() => setProfileMenuOpen(false)}
                >
                  Workspace settings
                </Link>
                <BrandSelect
                  className="workspace-menu-brand-select"
                  disabled={!workspace.activeWorkspace}
                  label="Workspace"
                  value={workspace.activeWorkspace?.id ?? ''}
                  options={workspaceOptions}
                  onChange={() => undefined}
                />
                <div className="workspace-credit-panel">
                  <span>AI generation credits</span>
                  <strong>Usage tracking enabled</strong>
                  <small>Credit balance will appear after the billing policy is connected.</small>
                </div>
                <button className="workspace-upgrade-button" type="button">Upgrade</button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    await signOut();
                    router.replace('/login');
                    router.refresh();
                  }}
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </aside>

        <section className="workspace-window" aria-label="Workspace">
          {children}
        </section>
        <AssistantFloatingButton
          className={`assistant-floating-button-fixed ${assistantOpen ? 'assistant-floating-button-hidden' : ''}`}
          onClick={() => setAssistantOpen(true)}
        />
        <AssistantShell
          open={assistantOpen}
          contextLabel={currentPath.startsWith('/library') ? 'Library' : 'Workspace'}
          onClose={() => setAssistantOpen(false)}
        />
      </main>
    </WorkspaceShellContext.Provider>
  );
}
