'use client';

import Link from 'next/link';
import { SectionOnboardingProvider } from '@/features/section-onboarding/ui/section-onboarding-provider';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { AssistantPetLauncher } from '@/features/assistant-pet/ui/assistant-pet-launcher';
import { ReverieLogo } from '@/shared/ui/reverie-logo';
import { AssistantShell } from '@/widgets/assistant-shell/ui/assistant-shell';
import { useWorkspaceProjects } from '../model/use-workspace-projects';
import { WorkspaceShellContext } from './workspace-shell-context';
import { WorkspaceNavigation } from './workspace-navigation';
import { WorkspaceProfileMenu } from './workspace-profile-menu';
import { WorkspaceEcosystemDialog } from './workspace-ecosystem-dialog';
import { NavigationIcon } from './navigation-icon';
import { useInterfaceLocale } from '@/shared/i18n/interface-locale';
import { WorkspaceSearchProvider } from './workspace-search-provider';
import { ProductionChatsCacheProvider } from '@/features/chat-assistant/model/production-chats-cache-context';
import { OnboardingAccountPreferences } from '@/shared/onboarding/account-preferences';

import { isDocumentWindow } from '../model/document-window';
import { DocumentReturnContext, useWorkspaceReturnHref } from './document-navigation';

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';
  const params = useSearchParams();
  const focused = isDocumentWindow(pathname, params ?? new URLSearchParams());
  const returnHref = useWorkspaceReturnHref(`${pathname}${params?.size ? `?${params}` : ''}`, focused);
  const showWorkspaceAssistant = pathname !== '/' && pathname !== '/create' && !pathname.startsWith('/stories/timelines/') && !pathname.startsWith('/chats/');
  const workspace = useWorkspaceProjects();
  const { text } = useInterfaceLocale();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [sidebarModes, setSidebarModes] = useState({ workspace: false, playground: true });
  const sidebarScope = pathname === '/playground' ? 'playground' : 'workspace';
  const sidebarCollapsed = sidebarModes[sidebarScope];
  const [ecosystemAnchor, setEcosystemAnchor] = useState<HTMLButtonElement | null>(null);

  return (
    <WorkspaceShellContext.Provider value={workspace}><DocumentReturnContext.Provider value={returnHref}>
      <SectionOnboardingProvider><ProductionChatsCacheProvider><WorkspaceSearchProvider>
      <OnboardingAccountPreferences />
      <main className="workspace-page" data-document-window={focused || undefined}>
        {!focused ? <aside className={`workspace-sidebar production-sidebar ${sidebarCollapsed ? 'workspace-sidebar-collapsed' : ''}`}
          data-onboarding-target="navigation" aria-label={text('Навигация Production', 'Production navigation')}>
          <div className="production-sidebar-top">
            <div className="production-logo-row">
              <button className="production-product-trigger" data-onboarding-target="ecosystem" type="button" aria-label={text('Продукты и рабочие пространства', 'Products and workspaces')}
                aria-haspopup="dialog" aria-expanded={Boolean(ecosystemAnchor)} onClick={(event) => setEcosystemAnchor(event.currentTarget)}>
                <ReverieLogo className="production-full-logo" />
                <ReverieLogo className="production-compact-logo" compact />
                <NavigationIcon name="chevrons" />
              </button>
              <button className="production-collapse-button production-small-button" type="button"
                aria-label={sidebarCollapsed ? text('Развернуть меню', 'Expand navigation') : text('Свернуть меню', 'Collapse navigation')} aria-expanded={!sidebarCollapsed}
                onClick={() => setSidebarModes((modes) => ({ ...modes, [sidebarScope]: !modes[sidebarScope] }))}><NavigationIcon name="collapse" /></button>
            </div>
            <WorkspaceNavigation collapsed={sidebarCollapsed} />
          </div>
          <div className="production-sidebar-bottom">
            <Link className="production-utility-link" href="/usage" aria-current={pathname === '/usage' ? 'page' : undefined} title={text('Использование', 'Usage')}>
              <NavigationIcon name="usage" /><span className="production-navigation-label">{text('Использование', 'Usage')}</span>
            </Link>
            <WorkspaceProfileMenu />
          </div>
        </aside> : null}
        <section className="workspace-window" aria-label="Workspace">{children}</section>
        {showWorkspaceAssistant ? <AssistantPetLauncher className={`assistant-floating-button-fixed ${assistantOpen ? 'assistant-floating-button-hidden' : ''}`}
          onClick={() => setAssistantOpen(true)} /> : null}
        {showWorkspaceAssistant ? <AssistantShell open={assistantOpen} contextLabel={pathname.startsWith('/library') ? 'Library'
          : pathname.startsWith('/playground') ? 'Playground' : 'Workspace'}
          onClose={() => setAssistantOpen(false)} route={pathname} workspaceId={workspace.activeWorkspace?.id} /> : null}
        {ecosystemAnchor ? <WorkspaceEcosystemDialog anchor={ecosystemAnchor} onClose={() => setEcosystemAnchor(null)} /> : null}
      </main>
      </WorkspaceSearchProvider></ProductionChatsCacheProvider></SectionOnboardingProvider>
    </DocumentReturnContext.Provider></WorkspaceShellContext.Provider>
  );
}
