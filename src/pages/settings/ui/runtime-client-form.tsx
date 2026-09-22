'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Button } from '@prodactionpro/ui-core/button';

import { Input as PuiInput } from '@prodactionpro/ui-core/input';

import { useState, type FormEvent } from 'react';
import { runtimeV2DefaultScopes, runtimeV2Scopes, type RuntimeV2Scope } from '@/modules/executable-pipelines/contracts/runtime-v2-contracts';
import { runtimeConnectionsApi } from '../api/runtime-connections-api';
import { runtimeScopeLabels } from '../model/runtime-connections-values';
import type { RuntimeConnectionsModel } from '../model/use-runtime-connections';
import styles from './runtime-connections.module.css';

export function RuntimeClientForm({ model, onCreated }: { model: RuntimeConnectionsModel; onCreated: () => void }) {
  const tUi = useTranslations();
  const ui_runtimeScopeLabels = useUiCatalog(runtimeScopeLabels, tUi);
  const [name, setName] = useState('Content Hub');
  const [application, setApplication] = useState('content-hub');
  const [externalWorkspace, setExternalWorkspace] = useState(model.workspaceId);
  const [scopes, setScopes] = useState<RuntimeV2Scope[]>([...runtimeV2DefaultScopes]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await model.mutate(() => runtimeConnectionsApi.createClient(model.workspaceId, {
      displayName: name.trim(), sourceApplication: application.trim(), externalWorkspaceRef: externalWorkspace.trim(), scopes,
    }), application.trim() === 'content-hub'
      ? tUi("Создан Content Hub Starter v1: пять независимых пайплайнов. Выпустите ключ для Content Hub.")
      : tUi("Подключение создано. Теперь выпустите ключ и добавьте разрешённые pipelines."));
    if (!result) return;
    model.setClientId(result.client.id);
    await model.refresh();
    onCreated();
  }
  return (
    <form className="settings-card settings-form" onSubmit={(event) => void submit(event)}>
      <h3>{tUi("Новое подключение")}</h3>
      <label><span>{tUi("Название приложения")}</span><PuiInput required maxLength={120} value={name}
        disabled={model.mutation} onChange={(event) => setName(event.target.value)} /></label>
      <label><span>{tUi("Код приложения")}</span><PuiInput required maxLength={120} pattern="[a-z0-9][a-z0-9._-]*" value={application}
        disabled={model.mutation} onChange={(event) => setApplication(event.target.value)} />
        <small>{tUi("Стабильное имя, например content-hub. Оно объединяет ключи одного приложения.")}</small></label>
      <label><span>{tUi("ID рабочего пространства в подключаемом приложении")}</span>
        <PuiInput required maxLength={160} pattern="[A-Za-z0-9._:-]+" value={externalWorkspace}
          disabled={model.mutation} onChange={(event) => setExternalWorkspace(event.target.value)} />
        <small>{tUi("Для Content Hub ID должен совпадать с выбранным Workspace Image Production. Чужое личное пространство подключить нельзя.")}</small></label>
      {application.trim() === 'content-hub' ? <p className={styles.muted}>{tUi("Content Hub Starter v1 автоматически создаст пять редактируемых пайплайнов: описание и обложку статьи, SEO- и Telegram-черновики, анализ Telegram. Без чужих файлов, ключей и запусков. Провайдер настраивается отдельно для этого пространства.")}</p> : null}
      <fieldset className={styles.scopes} disabled={model.mutation}>
        <legend>{tUi("Что приложение сможет делать")}</legend>
        {runtimeV2Scopes.map((scope) => (
          <label className="settings-checkbox" key={scope}>
            <input type="checkbox" checked={scopes.includes(scope)} onChange={(event) => setScopes((current) =>
              event.target.checked ? [...current, scope] : current.filter((item) => item !== scope))} />
            <span>{ui_runtimeScopeLabels[scope]}{scope === 'pipeline.grants.manage'
              ? <small>{tUi("Дополнительное право: приложение сможет само добавлять разрешения в пределах этого Workspace.")}</small> : null}</span>
          </label>
        ))}
      </fieldset>
      <Button size="sm" intent="neutral" appearance="solid" className="settings-primary-button" type="submit" disabled={model.mutation || scopes.length === 0}>
        {model.mutation ? tUi("Создаём…") : tUi("Создать подключение")}
      </Button>
    </form>
  );
}
