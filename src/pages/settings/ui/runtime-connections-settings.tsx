'use client';

import { Cable, Loader2, RefreshCcw } from 'lucide-react';
import { useState } from 'react';
import { useRuntimeConnections } from '../model/use-runtime-connections';
import { RuntimeClientForm } from './runtime-client-form';
import { RuntimeConnectionCard } from './runtime-connection-card';
import { SettingsState } from './provider-settings-state';
import styles from './runtime-connections.module.css';

export function RuntimeConnectionsSettings({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const model = useRuntimeConnections(onDirtyChange);
  const [creating, setCreating] = useState(false);
  const busy = model.mutation || model.workspacePending || model.clientsPending || model.detailsPending;
  return (
    <section className={`settings-section ${styles.section}`} aria-labelledby="runtime-connections-title">
      <header className="settings-section-head">
        <div>
          <h2 id="runtime-connections-title">Подключения</h2>
          <p>Разрешите Content Hub и другим приложениям запускать выбранные pipelines этого Workspace.</p>
        </div>
      </header>
      {model.workspaces.length > 0 ? (
        <label className={styles.selectLabel}>Рабочее пространство
          <select value={model.workspaceId} disabled={busy}
            onChange={(event) => { setCreating(false); model.selectWorkspace(event.target.value); }}>
            {model.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
          </select>
        </label>
      ) : null}
      {model.error ? <p className="settings-message settings-message-error" role="alert">{model.error}</p> : null}
      {model.notice ? <p className="settings-message settings-message-success" role="status">{model.notice}</p> : null}
      {model.workspacePending ? (
        <SettingsState busy icon={<Loader2 className="spin" size={22} />} title="Загружаем Workspace">Проверяем доступ.</SettingsState>
      ) : null}
      {!model.workspacePending && model.workspaces.length === 0 ? (
        <SettingsState icon={<Cable size={22} />} title="Нет доступных Workspace">
          <button type="button" onClick={() => void model.loadWorkspaces()}>Повторить</button>
        </SettingsState>
      ) : null}
      {model.workspaceId ? (
        <>
          <div className={styles.actions}>
            <button type="button" className="settings-quiet-button" disabled={busy} onClick={() => void model.refresh()}>
              <RefreshCcw size={14} />Обновить
            </button>
            {model.canManage ? <button type="button" className="settings-primary-button" disabled={busy || Boolean(model.issuedCredential)}
              onClick={() => setCreating((value) => !value)}>{creating ? 'Закрыть форму' : 'Подключить приложение'}</button> : null}
          </div>
          {!model.canManage ? <p className={styles.muted}>Подключения настраивают владелец и администраторы Workspace.</p> : null}
          {creating && model.canManage ? <RuntimeClientForm key={model.workspaceId} model={model} onCreated={() => setCreating(false)} /> : null}
          {model.clientsPending ? <p className={styles.muted} role="status">Обновляем подключения…</p> : null}
          {!model.clientsPending && model.clients.length === 0 ? (
            <div className="settings-card">
              <h3>Приложения пока не подключены</h3>
              <p className={styles.muted}>Создайте подключение, выпустите один ключ и разрешите ему нужные pipelines. Один ключ работает со всеми выданными разрешениями.</p>
            </div>
          ) : null}
          {model.clients.length > 0 ? (
            <label className={styles.selectLabel}>Приложение
              <select value={model.clientId} disabled={busy} onChange={(event) => model.selectClient(event.target.value)}>
                {model.clients.map((client) => <option key={client.id} value={client.id}>{client.displayName}{client.enabled ? '' : ' · отключено'}</option>)}
              </select>
            </label>
          ) : null}
          {model.detailsPending ? <p className={styles.muted} role="status">Загружаем ключи и разрешения…</p> : null}
          {model.details && model.details.client.id === model.clientId ? <RuntimeConnectionCard key={`${model.workspaceId}:${model.clientId}`} model={model} /> : null}
        </>
      ) : null}
    </section>
  );
}
