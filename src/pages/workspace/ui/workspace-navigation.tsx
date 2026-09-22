'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { NavigationIcon, type NavigationIconName } from './navigation-icon';
import { WorkspaceProjectsNavigation } from './workspace-projects-navigation';
import { WorkspaceChatsNavigation } from './workspace-chats-navigation';
import { useInterfaceLocale } from '@/shared/i18n/interface-locale';

const sections: { label: string; icon: NavigationIconName; href?: string }[] = [
  { label: 'Home', icon: 'home', href: '/' },
  { label: 'Flows', icon: 'flows', href: '/flows' },
  { label: 'Library', icon: 'library', href: '/library' },
  { label: 'Stories', icon: 'stories', href: '/stories' },
  { label: 'Community', icon: 'community' },
];

export function WorkspaceNavigation({ collapsed }: { collapsed: boolean }) {
  const { text } = useInterfaceLocale();
  const pathname = usePathname() ?? '/';
  const params = useSearchParams();
  const legacyFolder = pathname === '/' && (params?.has('folderId') || params?.get('scope') === 'projects');
  const active = pathname.startsWith('/stories') ? 'Stories' : pathname.startsWith('/library') ? 'Library'
    : legacyFolder || ['/flows', '/pipelines', '/playground', '/projects', '/editor'].some((path) => pathname === path || pathname.startsWith(`${path}/`)) ? 'Flows'
      : pathname === '/' || pathname === '/create' ? 'Home' : '';

  return <>
    <nav className="production-navigation" aria-label="Production">
      {sections.map(({ label, icon, href }) => {
        const title = label === 'Library' ? text('Библиотека', label) : label === 'Community' ? text('Сообщество', label) : label;
        const content = <><span className="production-navigation-icon"><NavigationIcon name={icon} /></span>
          <span className="production-navigation-label">{title}</span>
          {!href ? <small className="production-navigation-soon">{text('Скоро', 'Soon')}</small> : null}</>;
        return href ? <Link key={label} href={href} className="production-navigation-item"
          aria-current={active === label ? 'page' : undefined} title={collapsed ? title : undefined}>
          {content}
        </Link> : <button key={label} type="button" className="production-navigation-item"
          aria-disabled="true" title={`${title} — ${text('скоро', 'coming soon')}`} aria-label={`${title} — ${text('скоро', 'coming soon')}`}>{content}</button>;
      })}
    </nav>
    <div className="production-navigation-collections" hidden={collapsed}><WorkspaceProjectsNavigation /><WorkspaceChatsNavigation /></div>
  </>;
}
