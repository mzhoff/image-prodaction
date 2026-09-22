'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Button } from '@prodactionpro/ui-core/button';

import { SectionHelpButton } from '@/shared/ui/section-help';

import Link from 'next/link';
import { Cable, PlugZap, Shield, Trash2, UserRound, X } from '@prodactionpro/ui-core/icons';
import { useCallback, useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import type { SettingsSection } from '../model/settings-section';
import { AccountSettings } from './account-settings';
import { ProviderSettings } from './provider-settings';
import { SecuritySettings } from './security-settings';
import { RuntimeConnectionsSettings } from './runtime-connections-settings';

interface SettingsPanelProps {
  section: SettingsSection;
  onClose?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  presentation: 'dialog' | 'page';
}

const navigation = [
  { section: 'account' as const, label: 'Профиль', icon: UserRound, group: 'Личные' },
  { section: 'security' as const, label: 'Безопасность', icon: Shield, group: 'Личные' },
  { section: 'providers' as const, label: 'AI и баланс', icon: PlugZap, group: 'Пространство' },
  { section: 'integrations' as const, label: 'Подключения', icon: Cable, group: 'Пространство' },
];

export function SettingsPanel({
  section,
  onClose,
  onDirtyChange,
  presentation,
}: SettingsPanelProps) {
  const tUi = useTranslations();
  const ui_navigation = useUiCatalog(navigation, tUi);
  const [dirty, setDirty] = useState(false);

  const updateDirty = useCallback((nextDirty: boolean) => {
    setDirty(nextDirty);
    onDirtyChange?.(nextDirty);
  }, [onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [dirty]);

  function canLeave() {
    return !dirty || window.confirm(tUi("Есть несохранённые изменения. Закрыть настройки без сохранения?"));
  }

  function handleClose() {
    if (presentation === 'dialog') {
      onClose?.();
      return;
    }
    if (!canLeave()) return;
    onClose?.();
  }

  function handleNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (canLeave()) return;
    event.preventDefault();
  }

  return (
    <div className={`settings-panel settings-panel-${presentation}`}>
      <header className="settings-header">
        <div>
          <h1 id="settings-title">{tUi("Настройки")}</h1>
        </div>
        <div className="production-section-actions"><SectionHelpButton section="settings" label={tUi("Как устроены настройки")} />
        {presentation === 'dialog' ? (
          <Button size="sm" intent="neutral" appearance="soft" className="settings-close-button" type="button" onClick={handleClose} aria-label={tUi("Закрыть настройки")}>
            <X size={18} />
          </Button>
        ) : (
          <Link
            className="settings-close-button"
            href="/"
            onClick={handleNavigation}
            aria-label={tUi("Закрыть настройки")}
          >
            <X size={18} />
          </Link>
        )}</div>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label={tUi("Разделы настроек")}>
          {ui_navigation.map((item, index) => {
            const showGroup = index === 0 || ui_navigation[index - 1]?.group !== item.group;
            return (
              <div className="settings-nav-entry" key={item.section}>
                {showGroup ? <span className="settings-nav-group">{item.group}</span> : null}
                <Link
                  className={section === item.section ? 'settings-nav-active' : ''}
                  href={`/settings/${item.section}`}
                  onClick={handleNavigation}
                  replace={presentation === 'dialog'}
                  aria-current={section === item.section ? 'page' : undefined}
                >
                  <span className="settings-nav-icon"><item.icon size={17} /></span>
                  {item.label}
                </Link>
              </div>
            );
          })}
          <div className="settings-nav-entry"><Link href="/trash" onClick={handleNavigation}>
            <span className="settings-nav-icon"><Trash2 size={17} /></span>{tUi("Корзина")}</Link></div>
        </nav>

        <div className="settings-content">
          {section === 'account'
            ? <AccountSettings onDirtyChange={updateDirty} />
            : section === 'security'
              ? <SecuritySettings onDirtyChange={updateDirty} />
              : section === 'providers'
                ? <ProviderSettings onDirtyChange={updateDirty} />
                : <RuntimeConnectionsSettings onDirtyChange={updateDirty} />}
        </div>
      </div>
    </div>
  );
}
