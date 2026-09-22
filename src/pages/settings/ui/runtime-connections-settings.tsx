'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Button } from '@prodactionpro/ui-core/button';

import { Cable, Loader2, RefreshCcw } from '@prodactionpro/ui-core/icons';
import { useState } from 'react';
import { SettingsSelect } from './settings-select';
import { useRuntimeConnections } from '../model/use-runtime-connections';
import { RuntimeClientForm } from './runtime-client-form';
import { RuntimeConnectionCard } from './runtime-connection-card';
import { SettingsState } from './provider-settings-state';
import styles from './runtime-connections.module.css';

export function RuntimeConnectionsSettings({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const tUi = useTranslations();
  const model = useRuntimeConnections(onDirtyChange);
  const [creating, setCreating] = useState(false);
  const busy = model.mutation || model.workspacePending || model.clientsPending || model.detailsPending;
  return (
    <section className={`settings-section ${styles.section}`} aria-labelledby="runtime-connections-title">
      <header className="settings-section-head">
        <div>
          <h2 id="runtime-connections-title">{tUi("Подключения")}</h2>
          <p>{tUi("Доступ приложений к вашим Flows.")}</p>
        </div>
      </header>
      {model.workspaces.length > 0 ? (
        <SettingsSelect label={tUi("Пространство")} value={model.workspaceId} disabled={busy}
          onChange={(value) => { setCreating(false); model.selectWorkspace(value); }}
          options={model.workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name }))} />
      ) : null}
      {model.error ? <p className="settings-message settings-message-error" role="alert">{typeof (model.error) === 'string' ? tUi((model.error) as string) : (model.error)}</p> : null}
      {model.notice ? <p className="settings-message settings-message-success" role="status">{typeof (model.notice) === 'string' ? tUi((model.notice) as string) : (model.notice)}</p> : null}
      {model.workspacePending ? (
        <SettingsState busy icon={<Loader2 className="spin" size={22} />} title={tUi("Загружаем Workspace")}>{tUi("Проверяем доступ.")}</SettingsState>
      ) : null}
      {!model.workspacePending && model.workspaces.length === 0 ? (
        <SettingsState icon={<Cable size={22} />} title={tUi("Нет доступных Workspace")}>
          <Button size="sm" intent="neutral" appearance="soft" type="button" onClick={() => void model.loadWorkspaces()}>{tUi("Повторить")}</Button>
        </SettingsState>
      ) : null}
      {model.workspaceId ? (
        <>
          <div className={styles.actions}>
            <Button size="sm" intent="neutral" appearance="soft" type="button" className="settings-quiet-button" disabled={busy} onClick={() => void model.refresh()}>
              <RefreshCcw size={14} />{tUi("Обновить")}</Button>
            {model.canManage ? <Button size="sm" intent="neutral" appearance="solid" type="button" className="settings-primary-button" disabled={busy || Boolean(model.issuedCredential)}
              onClick={() => setCreating((value) => !value)}>{creating ? tUi("Закрыть форму") : tUi("Подключить приложение")}</Button> : null}
          </div>
          {!model.canManage ? <p className={styles.muted}>{tUi("Подключения настраивают владелец и администраторы Workspace.")}</p> : null}
          {creating && model.canManage ? <RuntimeClientForm key={model.workspaceId} model={model} onCreated={() => setCreating(false)} /> : null}
          {model.clientsPending ? <p className={styles.muted} role="status">{tUi("Обновляем подключения…")}</p> : null}
          {!model.clientsPending && model.clients.length === 0 ? (
            <div className="settings-card">
              <h3>{tUi("Приложения пока не подключены")}</h3>
              <p className={styles.muted}>{tUi("Подключите приложение, затем выберите доступные ему Flows.")}</p>
            </div>
          ) : null}
          {model.clients.length > 0 ? (
            <SettingsSelect label={tUi("Приложение")} value={model.clientId} disabled={busy} onChange={model.selectClient}
              options={model.clients.map((client) => ({ value: client.id, label: `${client.displayName}${client.enabled ? '' : tUi(" · отключено")}` }))} />
          ) : null}
          {model.detailsPending ? <p className={styles.muted} role="status">{tUi("Загружаем ключи и разрешения…")}</p> : null}
          {model.details && model.details.client.id === model.clientId ? <RuntimeConnectionCard key={`${model.workspaceId}:${model.clientId}`} model={model} /> : null}
        </>
      ) : null}
    </section>
  );
}
