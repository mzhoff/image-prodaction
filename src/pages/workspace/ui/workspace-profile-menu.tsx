'use client';

import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';
import { ArrowUpRight, ChevronRight, Shield, UserRound, X } from '@prodactionpro/ui-core/icons';
import { useSession } from '@/shared/auth/client';
import { useInterfaceLocale } from '@/shared/i18n/interface-locale';
import { AnchoredNavigationDialog } from './anchored-navigation-dialog';
import { AccountQuickPreferences } from './account-quick-preferences';
import { WorkspaceSignOutButton } from './workspace-sign-out-button';
import { useSubscriptions } from '@/features/subscriptions/ui/subscription-provider';
import { useWorkspaceShell } from './workspace-shell-context';
import './account-menu.css';

const subscribeToHydration = () => () => undefined;
const clientReady = () => true;
const serverReady = () => false;

export function WorkspaceProfileMenu() {
  const openSubscriptions = useSubscriptions();
  const { activeWorkspace } = useWorkspaceShell();
  const { data: cachedSession } = useSession();
  const { text } = useInterfaceLocale();
  const hydrated = useSyncExternalStore(subscribeToHydration, clientReady, serverReady);
  const session = hydrated ? cachedSession : null;
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const name = session?.user.name || text('Ваш аккаунт', 'Your account');
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('');
  const avatar = session?.user.image ? <img src={session.user.image} alt="" draggable={false} />
    : <span className="production-avatar-initials" aria-hidden="true">{initials}</span>;
  const close = () => setAnchor(null);

  return <div className="production-profile">
    <button className="production-profile-trigger" type="button" aria-haspopup="dialog" aria-expanded={Boolean(anchor)}
      aria-label={`${text('Аккаунт', 'Account')}: ${name}`} title={name} onClick={(event) => setAnchor(event.currentTarget)}>
      {avatar}<span className="production-navigation-label">{name}</span>
    </button>
    {anchor ? <AnchoredNavigationDialog anchor={anchor} placement="bottom" width={Math.max(336, anchor.offsetWidth * 1.3)}
      label={text('Ваш аккаунт', 'Your account')} className="production-account-dialog" onClose={close}>
      <header className="production-account-header">
        <div><h2>{text('Аккаунт', 'Account')}</h2><p>{text('Ваши настройки в Reverie', 'Your Reverie preferences')}</p></div>
        <button autoFocus type="button" className="production-account-close" onClick={close} aria-label={text('Закрыть аккаунт', 'Close account')}><X size={18} /></button>
      </header>
      <div className="production-account-content">
        <nav className="production-account-links" aria-label={text('Настройки аккаунта', 'Account settings')}>
          <Link href="/settings/account" onClick={close}><span className="production-account-link-icon"><UserRound size={18} /></span>
            <span><strong>{text('Личные данные', 'Personal details')}</strong><small>{text('Имя, профиль и почта', 'Name, profile and email')}</small></span><ChevronRight size={15} /></Link>
          <Link href="/settings/security" onClick={close}><span className="production-account-link-icon"><Shield size={18} /></span>
            <span><strong>{text('Безопасность', 'Security')}</strong><small>{text('Вход и защита аккаунта', 'Sign-in and account protection')}</small></span><ChevronRight size={15} /></Link>
        </nav>
        <AccountQuickPreferences />
        <section className="production-account-subscription" aria-label={text('Подписка и оплата', 'Subscription and billing')}>
          <div className="production-account-subscription-heading"><strong>{text('Тарифы и AI-бюджет', 'Plans and AI budget')}</strong><span>{text('Бета', 'Beta')}</span></div>
          <p>{text('Добавьте AI-бюджет для генераций и ассистента.', 'Add AI budget for generations and your assistant.')}</p>
          <button type="button" onClick={() => { close(); openSubscriptions({ workspaceId: activeWorkspace?.id, tab: 'budget', source: 'profile_menu' }); }}>{text('Пополнить баланс', 'Top up balance')}<ArrowUpRight size={14} /></button>
          <small>{text('Общий баланс вашего пространства.', 'A shared balance for your workspace.')}</small>
        </section>
        <div className="production-account-signout"><WorkspaceSignOutButton /></div>
      </div>
      <footer className="production-profile-identity" title={session?.user.email}>{avatar}<strong>{name}</strong></footer>
    </AnchoredNavigationDialog> : null}
  </div>;
}
