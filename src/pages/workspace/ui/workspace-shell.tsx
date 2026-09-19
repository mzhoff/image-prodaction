'use client';

import Link from 'next/link';
import { ThemeControl } from '@/shared/ui/theme-control';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlaskConical,
  PanelLeftClose,
  PanelLeftOpen,
} from '@prodactionpro/ui-core/icons';
import { signOut, useSession } from '@/shared/auth/client';
import { BrandSelect } from '@/shared/ui/brand-select';
import { AssistantPetLauncher } from '@/features/assistant-pet/ui/assistant-pet-launcher';
import { ReverieLogo } from '@/shared/ui/reverie-logo';
import { AssistantShell } from '@/widgets/assistant-shell/ui/assistant-shell';
import { useWorkspaceProjects } from '../model/use-workspace-projects';
import { WorkspaceShellContext } from './workspace-shell-context';
import { WorkspaceNavigation } from './workspace-navigation';

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const workspace = useWorkspaceProjects();
  const { data: session } = useSession();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const currentPath = pathname ?? '/';
  const activeNav = currentPath.startsWith('/library')
    ? 'library'
    : currentPath.startsWith('/playground')
      ? 'playground'
      : currentPath.startsWith('/trash')
        ? 'trash'
        : currentPath.startsWith('/pipelines')
          ? 'pipelines'
          : 'my-files';
  const workspaceOptions = useMemo(() => (
    workspace.workspaces.length
      ? workspace.workspaces.map((item) => ({ value: item.id, label: item.name }))
      : [{ value: '', label: 'Workspace загружается…' }]
  ), [workspace.workspaces]);

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
        <aside
          className={`workspace-sidebar ${sidebarCollapsed ? 'workspace-sidebar-collapsed' : ''}`}
          aria-label="Workspace navigation"
        >
          <div className="workspace-sidebar-top">
            <div className="workspace-logo-row">
              <Link className="workspace-logo reverie-logo-link" href="/" aria-label="Reverie home">
                <ReverieLogo />
              </Link>
              <button
                className="workspace-icon-button"
                type="button"
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-expanded={!sidebarCollapsed}
                onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
              >
                {sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
              </button>
            </div>
            {!sidebarCollapsed ? <BrandSelect
              className="workspace-sidebar-workspace-select"
              disabled={!workspace.activeWorkspace}
              label="Workspace"
              value={workspace.activeWorkspace?.id ?? ''}
              options={workspaceOptions}
              onChange={workspace.selectWorkspace}
            /> : null}
            <WorkspaceNavigation collapsed={sidebarCollapsed} />
          </div>

          <div className="workspace-sidebar-bottom">
            {!sidebarCollapsed ? <ThemeControl /> : null}
            <Link
              aria-current={activeNav === 'playground' ? 'page' : undefined}
              className={`workspace-playground-link ${activeNav === 'playground' ? 'workspace-playground-link-active' : ''}`}
              href="/playground"
              aria-label={sidebarCollapsed ? 'Playground' : undefined}
              title={sidebarCollapsed ? 'Playground' : undefined}
            >
              <FlaskConical size={17} />
              <span>Playground</span>
            </Link>
            <div className="workspace-profile-area" ref={profileMenuRef}>
              <button
                aria-expanded={profileMenuOpen}
                aria-haspopup="menu"
                aria-label={sidebarCollapsed ? (session?.user.name || 'Your account') : undefined}
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
                    href="/account"
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
          </div>
        </aside>

        <section className="workspace-window" aria-label="Workspace">
          {children}
        </section>
        <AssistantPetLauncher
          className={`assistant-floating-button-fixed ${assistantOpen ? 'assistant-floating-button-hidden' : ''}`}
          onClick={() => setAssistantOpen(true)}
        />
        <AssistantShell
          open={assistantOpen}
          contextLabel={currentPath.startsWith('/library')
            ? 'Library'
            : currentPath.startsWith('/playground')
              ? 'Playground'
              : 'Workspace'}
          onClose={() => setAssistantOpen(false)}
          route={currentPath}
          workspaceId={workspace.activeWorkspace?.id}
        />
      </main>
    </WorkspaceShellContext.Provider>
  );
}
