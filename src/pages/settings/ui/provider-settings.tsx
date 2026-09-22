'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Button } from '@prodactionpro/ui-core/button';
import { useSubscriptions } from '@/features/subscriptions/ui/subscription-provider';

import { useEffect, useState } from 'react';
import { MemberBudgetsCard } from './member-budgets-card';
import { AlertCircle, Loader2, PlugZap, RefreshCcw } from '@prodactionpro/ui-core/icons';
import { SettingsSelect } from './settings-select';
import { useProviderSettingsModel } from '../model/use-provider-settings-model';
import { ProviderConnectionCard } from './provider-connection-card';
import { LocalUsageCard, ProviderUsageCard } from './provider-usage-cards';
import { ProviderSettingsSkeleton, SettingsState } from './provider-settings-state';

interface ProviderSettingsProps {
  onDirtyChange: (dirty: boolean) => void;
}

export function ProviderSettings({ onDirtyChange }: ProviderSettingsProps) {
  const tUi = useTranslations();
  const openSubscriptions = useSubscriptions();
  const [providerDirty, setProviderDirty] = useState(false);
  const [budgetDirty, setBudgetDirty] = useState(false);
  const model = useProviderSettingsModel(setProviderDirty);
  useEffect(() => {
    onDirtyChange(providerDirty || budgetDirty);
    return () => onDirtyChange(false);
  }, [providerDirty, budgetDirty, onDirtyChange]);
  return (
    <section className="settings-section settings-provider-section" aria-labelledby="settings-providers-title">
      <header className="settings-section-head settings-provider-title-row">
        <div>
          <h2 id="settings-providers-title">{tUi("AI и баланс")}</h2>
        </div>
        <Button type="button" intent="neutral" appearance="solid" disabled={!model.selectedWorkspaceId}
          onClick={() => openSubscriptions({ workspaceId: model.selectedWorkspaceId, tab: 'budget', source: 'provider_settings' })}>{tUi("Пополнить баланс")}</Button>
        {model.workspaceOptions.length > 0 ? (
          <SettingsSelect
            className="settings-workspace-select"
            disabled={model.workspacesPending || model.mutation !== null || budgetDirty}
            label={tUi("Пространство")}
            value={model.selectedWorkspaceId}
            options={model.workspaceOptions}
            onChange={model.selectWorkspace}
          />
        ) : null}
      </header>

      {model.workspacesPending ? (
        <SettingsState busy icon={<Loader2 className="spin" size={22} />} title={tUi("Загружаем Workspace")}>
          {tUi("Проверяем доступные рабочие пространства.")}</SettingsState>
      ) : null}
      {!model.workspacesPending && model.workspacesError ? (
        <SettingsState icon={<AlertCircle size={22} />} title={tUi("Workspace недоступны")} tone="error">
          <span>{typeof (model.workspacesError) === 'string' ? tUi((model.workspacesError) as string) : (model.workspacesError)}</span>
          <Button size="sm" intent="neutral" appearance="soft" type="button" onClick={() => void model.loadWorkspaces()}>
            <RefreshCcw size={14} />{tUi("Повторить")}</Button>
        </SettingsState>
      ) : null}
      {!model.workspacesPending && !model.workspacesError && model.workspaces.length === 0 ? (
        <SettingsState icon={<PlugZap size={22} />} title={tUi("Нет доступных Workspace")}>
          {tUi("Сначала создайте или получите доступ к рабочему пространству.")}</SettingsState>
      ) : null}

      {model.detailsPending && model.selectedWorkspaceId ? <ProviderSettingsSkeleton /> : null}
      {!model.detailsPending && model.detailsError ? (
        <SettingsState icon={<AlertCircle size={22} />}
          title={tUi("Настройки провайдера недоступны")} tone="error">
          <span>{typeof (model.detailsError) === 'string' ? tUi((model.detailsError) as string) : (model.detailsError)}</span>
          <Button size="sm" intent="neutral" appearance="soft" type="button"
            onClick={() => void model.loadWorkspaceDetails(model.selectedWorkspaceId)}>
            <RefreshCcw size={14} />{tUi("Повторить")}</Button>
        </SettingsState>
      ) : null}

      {!model.detailsPending && !model.detailsError && model.effectiveWorkspace ? (
        <div className="settings-provider-stack">
          <ProviderConnectionCard model={model} />
          <ProviderUsageCard connection={model.connection} usage={model.keyUsage} />
          <MemberBudgetsCard key={model.effectiveWorkspace.id} workspaceId={model.effectiveWorkspace.id} onDirtyChange={setBudgetDirty} />
          <LocalUsageCard usage={model.aiUsage} />
          {model.secondaryError ? (
            <p className="settings-message settings-message-error" role="alert">
              {typeof (model.secondaryError) === 'string' ? tUi((model.secondaryError) as string) : (model.secondaryError)}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
