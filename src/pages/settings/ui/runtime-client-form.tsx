'use client';

import { useState, type FormEvent } from 'react';
import { runtimeV2DefaultScopes, runtimeV2Scopes, type RuntimeV2Scope } from '@/modules/executable-pipelines/contracts/runtime-v2-contracts';
import { runtimeConnectionsApi } from '../api/runtime-connections-api';
import { runtimeScopeLabels } from '../model/runtime-connections-values';
import type { RuntimeConnectionsModel } from '../model/use-runtime-connections';
import styles from './runtime-connections.module.css';

export function RuntimeClientForm({ model, onCreated }: { model: RuntimeConnectionsModel; onCreated: () => void }) {
  const [name, setName] = useState('Content Hub');
  const [application, setApplication] = useState('content-hub');
  const [externalWorkspace, setExternalWorkspace] = useState('');
  const [scopes, setScopes] = useState<RuntimeV2Scope[]>([...runtimeV2DefaultScopes]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await model.mutate(() => runtimeConnectionsApi.createClient(model.workspaceId, {
      displayName: name.trim(), sourceApplication: application.trim(), externalWorkspaceRef: externalWorkspace.trim(), scopes,
    }), 'Подключение создано. Теперь выпустите ключ и добавьте разрешённые pipelines.');
    if (!result) return;
    model.setClientId(result.client.id);
    await model.refresh();
    onCreated();
  }
  return (
    <form className="settings-card settings-form" onSubmit={(event) => void submit(event)}>
      <h3>Новое подключение</h3>
      <label><span>Название приложения</span><input required maxLength={120} value={name}
        disabled={model.mutation} onChange={(event) => setName(event.target.value)} /></label>
      <label><span>Код приложения</span><input required maxLength={120} pattern="[a-z0-9][a-z0-9._-]*" value={application}
        disabled={model.mutation} onChange={(event) => setApplication(event.target.value)} />
        <small>Стабильное имя, например content-hub. Оно объединяет ключи одного приложения.</small></label>
      <label><span>ID рабочего пространства в подключаемом приложении</span>
        <input required maxLength={160} pattern="[A-Za-z0-9._:-]+" value={externalWorkspace}
          disabled={model.mutation} onChange={(event) => setExternalWorkspace(event.target.value)} />
        <small>Возьмите ID из Content Hub. Для каждой пары рабочих пространств создаётся одно подключение.</small></label>
      <fieldset className={styles.scopes} disabled={model.mutation}>
        <legend>Что приложение сможет делать</legend>
        {runtimeV2Scopes.map((scope) => (
          <label className="settings-checkbox" key={scope}>
            <input type="checkbox" checked={scopes.includes(scope)} onChange={(event) => setScopes((current) =>
              event.target.checked ? [...current, scope] : current.filter((item) => item !== scope))} />
            <span>{runtimeScopeLabels[scope]}{scope === 'pipeline.grants.manage'
              ? <small>Дополнительное право: приложение сможет само добавлять разрешения в пределах этого Workspace.</small> : null}</span>
          </label>
        ))}
      </fieldset>
      <button className="settings-primary-button" type="submit" disabled={model.mutation || scopes.length === 0}>
        {model.mutation ? 'Создаём…' : 'Создать подключение'}
      </button>
    </form>
  );
}
