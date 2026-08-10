'use client';

import { AlertCircle, Loader2, PlugZap, RefreshCcw } from 'lucide-react';
import { BrandSelect } from '@/shared/ui/brand-select';
import { useProviderSettingsModel } from '../model/use-provider-settings-model';
import { ProviderConnectionCard } from './provider-connection-card';
import { LocalUsageCard, ProviderUsageCard } from './provider-usage-cards';
import { ProviderSettingsSkeleton, SettingsState } from './provider-settings-state';

interface ProviderSettingsProps {
  onDirtyChange: (dirty: boolean) => void;
}

export function ProviderSettings({ onDirtyChange }: ProviderSettingsProps) {
  const model = useProviderSettingsModel(onDirtyChange);
  return (
    <section className="settings-section settings-provider-section" aria-labelledby="settings-providers-title">
      <header className="settings-section-head settings-provider-title-row">
        <div>
          <h2 id="settings-providers-title">AI Providers</h2>
          <p>Подключение и расходы AI-провайдеров на уровне Workspace.</p>
        </div>
        {model.workspaceOptions.length > 0 ? (
          <BrandSelect
            className="settings-workspace-select"
            disabled={model.workspacesPending || model.mutation !== null}
            label="Workspace"
            value={model.selectedWorkspaceId}
            options={model.workspaceOptions}
            onChange={model.selectWorkspace}
          />
        ) : null}
      </header>

      {model.workspacesPending ? (
        <SettingsState busy icon={<Loader2 className="spin" size={22} />} title="Загружаем Workspace">
          Проверяем доступные рабочие пространства.
        </SettingsState>
      ) : null}
      {!model.workspacesPending && model.workspacesError ? (
        <SettingsState icon={<AlertCircle size={22} />} title="Workspace недоступны" tone="error">
          <span>{model.workspacesError}</span>
          <button type="button" onClick={() => void model.loadWorkspaces()}>
            <RefreshCcw size={14} />Повторить
          </button>
        </SettingsState>
      ) : null}
      {!model.workspacesPending && !model.workspacesError && model.workspaces.length === 0 ? (
        <SettingsState icon={<PlugZap size={22} />} title="Нет доступных Workspace">
          Сначала создайте или получите доступ к рабочему пространству.
        </SettingsState>
      ) : null}

      {model.detailsPending && model.selectedWorkspaceId ? <ProviderSettingsSkeleton /> : null}
      {!model.detailsPending && model.detailsError ? (
        <SettingsState icon={<AlertCircle size={22} />}
          title="Настройки провайдера недоступны" tone="error">
          <span>{model.detailsError}</span>
          <button type="button"
            onClick={() => void model.loadWorkspaceDetails(model.selectedWorkspaceId)}>
            <RefreshCcw size={14} />Повторить
          </button>
        </SettingsState>
      ) : null}

      {!model.detailsPending && !model.detailsError && model.effectiveWorkspace ? (
        <div className="settings-provider-stack">
          <ProviderConnectionCard model={model} />
          <ProviderUsageCard connection={model.connection} usage={model.keyUsage} />
          <LocalUsageCard usage={model.aiUsage} />
          {model.secondaryError ? (
            <p className="settings-message settings-message-error" role="alert">
              {model.secondaryError}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
