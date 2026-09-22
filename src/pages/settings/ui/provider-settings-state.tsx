'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import type { ReactNode } from 'react';

export function SettingsState({ busy = false, children, icon, title, tone = 'neutral' }: {
  busy?: boolean;
  children: ReactNode;
  icon: ReactNode;
  title: string;
  tone?: 'error' | 'neutral';
}) {
  return (
    <div className={`settings-provider-state settings-provider-state-${tone}`}
      aria-busy={busy || undefined} role={tone === 'error' ? 'alert' : 'status'}>
      <span>{icon}</span><strong>{title}</strong><div>{children}</div>
    </div>
  );
}

export function ProviderSettingsSkeleton() {
  const tUi = useTranslations();
  return (
    <div className="settings-provider-skeleton"
      aria-label={tUi("Загружаем настройки AI Providers")} aria-busy="true">
      <i /><i /><i />
    </div>
  );
}
