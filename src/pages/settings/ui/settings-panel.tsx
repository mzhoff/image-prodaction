'use client';

import Link from 'next/link';
import { Shield, UserRound, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import type { SettingsSection } from '../model/settings-section';
import { AccountSettings } from './account-settings';
import { SecuritySettings } from './security-settings';

interface SettingsPanelProps {
  section: SettingsSection;
  onClose?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  presentation: 'dialog' | 'page';
}

const navigation = [
  { section: 'account' as const, label: 'Аккаунт', icon: UserRound },
  { section: 'security' as const, label: 'Безопасность', icon: Shield },
];

export function SettingsPanel({
  section,
  onClose,
  onDirtyChange,
  presentation,
}: SettingsPanelProps) {
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
    return !dirty || window.confirm('Есть несохранённые изменения. Закрыть настройки без сохранения?');
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
          <span>Reverie</span>
          <h1 id="settings-title">Настройки</h1>
        </div>
        {presentation === 'dialog' ? (
          <button className="settings-close-button" type="button" onClick={handleClose} aria-label="Закрыть настройки">
            <X size={18} />
          </button>
        ) : (
          <Link
            className="settings-close-button"
            href="/"
            onClick={handleNavigation}
            aria-label="Закрыть настройки"
          >
            <X size={18} />
          </Link>
        )}
      </header>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Разделы настроек">
          {navigation.map((item) => (
            <Link
              className={section === item.section ? 'settings-nav-active' : ''}
              href={`/settings/${item.section}`}
              key={item.section}
              onClick={handleNavigation}
              aria-current={section === item.section ? 'page' : undefined}
            >
              <item.icon size={16} />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="settings-content">
          {section === 'account'
            ? <AccountSettings onDirtyChange={updateDirty} />
            : <SecuritySettings onDirtyChange={updateDirty} />}
        </div>
      </div>
    </div>
  );
}
