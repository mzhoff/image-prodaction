'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Button } from '@prodactionpro/ui-core/button';

import { useState } from 'react';
import type { RuntimeConnectionsModel } from '../model/use-runtime-connections';
import { RuntimeGrantForm } from './runtime-grant-form';
import { RuntimeGrantCard } from './runtime-grant-card';
import styles from './runtime-connections.module.css';

export function RuntimeGrants({ model }: { model: RuntimeConnectionsModel }) {
  const tUi = useTranslations();
  const [adding, setAdding] = useState(false);
  const grants = model.details?.grants ?? [];
  return (
    <article className="settings-card">
      <header className={styles.cardHeader}>
        <div><h3>{tUi("Разрешённые pipelines")}</h3><p className={styles.muted}>{tUi("Каждая функция приложения получает собственное разрешение и закреплённую версию.")}</p></div>
        {model.canManage && model.details?.client.enabled ? (
          <Button size="sm" intent="neutral" appearance="soft" className="settings-quiet-button" type="button" disabled={model.mutation}
            onClick={() => setAdding((current) => !current)}>{adding ? tUi("Закрыть") : tUi("Добавить")}</Button>
        ) : null}
      </header>
      {grants.length === 0 ? <p className={styles.muted}>{tUi("Разрешений пока нет. Сам по себе ключ не даёт доступа к pipelines.")}</p> : null}
      {adding ? <RuntimeGrantForm model={model} onCreated={() => setAdding(false)} /> : null}
      <div className={styles.stack}>{grants.map((grant) => <RuntimeGrantCard key={`${grant.id}:${grant.revision}`} grant={grant} model={model} />)}</div>
    </article>
  );
}
