'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Button } from '@prodactionpro/ui-core/button';

import { runtimeConnectionsApi } from '../api/runtime-connections-api';
import type { RuntimeConnectionsModel } from '../model/use-runtime-connections';
import { runtimeScopeLabels } from '../model/runtime-connections-values';
import { RuntimeCredentials } from './runtime-credentials';
import { RuntimeGrants } from './runtime-grants';
import styles from './runtime-connections.module.css';

export function RuntimeConnectionCard({ model }: { model: RuntimeConnectionsModel }) {
  const tUi = useTranslations();
  const ui_runtimeScopeLabels = useUiCatalog(runtimeScopeLabels, tUi);
  const details = model.details;
  if (!details) return null;
  const client = details.client;
  async function toggleEnabled() {
    if (!client.enabled || window.confirm(tUi("Отключить приложение? Новые запуски будут запрещены. История и готовые файлы сохранятся."))) {
      await model.mutate(() => runtimeConnectionsApi.setClientEnabled(model.workspaceId, client.id, !client.enabled),
        client.enabled ? tUi("Приложение отключено. Ранее созданные запуски не удалены.") : tUi("Приложение включено."));
      await model.refresh();
    }
  }
  return (
    <div className={styles.stack}>
      <article className="settings-card">
        <header className={styles.cardHeader}>
          <div><h3>{client.displayName}</h3><p className={styles.muted}>{client.enabled ? tUi("Подключение включено") : tUi("Подключение отключено")}</p></div>
          {model.canManage ? <Button size="sm" intent="danger" appearance="soft" className={client.enabled ? 'settings-danger-button' : 'settings-quiet-button'}
            type="button" disabled={model.mutation} onClick={() => void toggleEnabled()}>{client.enabled ? tUi("Отключить") : tUi("Включить")}</Button> : null}
        </header>
        {details.credentials.every((credential) => credential.revokedAt !== null) ? (
          <p className={styles.callout}>{tUi("Шаг 1. Выпустите ключ и перенесите его в серверные настройки подключаемого приложения.")}</p>
        ) : null}
        {details.grants.length === 0 ? (
          <p className={styles.callout}>{tUi("Шаг 2. Разрешите нужные pipelines ниже. Без разрешений ключ не сможет запустить генерацию.")}</p>
        ) : null}
        <details className={styles.diagnostics}>
          <summary>{tUi("Доступ и технические сведения")}</summary>
          <dl><dt>{tUi("ID подключения")}</dt><dd>{client.id}</dd><dt>{tUi("Приложение")}</dt><dd>{client.sourceApplication}</dd>
            <dt>{tUi("Внешний Workspace")}</dt><dd>{client.externalWorkspaceRef}</dd></dl>
          <ul>{client.scopes.map((scope) => <li key={scope}>{ui_runtimeScopeLabels[scope]}</li>)}</ul>
        </details>
      </article>
      <RuntimeCredentials model={model} />
      <RuntimeGrants model={model} />
    </div>
  );
}
