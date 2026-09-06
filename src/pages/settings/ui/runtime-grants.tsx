'use client';

import { useState } from 'react';
import type { RuntimeConnectionsModel } from '../model/use-runtime-connections';
import { RuntimeGrantForm } from './runtime-grant-form';
import { RuntimeGrantCard } from './runtime-grant-card';
import styles from './runtime-connections.module.css';

export function RuntimeGrants({ model }: { model: RuntimeConnectionsModel }) {
  const [adding, setAdding] = useState(false);
  const grants = model.details?.grants ?? [];
  return (
    <article className="settings-card">
      <header className={styles.cardHeader}>
        <div><h3>Разрешённые pipelines</h3><p className={styles.muted}>Каждая функция приложения получает собственное разрешение и закреплённую версию.</p></div>
        {model.canManage && model.details?.client.enabled ? (
          <button className="settings-quiet-button" type="button" disabled={model.mutation}
            onClick={() => setAdding((current) => !current)}>{adding ? 'Закрыть' : 'Добавить'}</button>
        ) : null}
      </header>
      {grants.length === 0 ? <p className={styles.muted}>Разрешений пока нет. Сам по себе ключ не даёт доступа к pipelines.</p> : null}
      {adding ? <RuntimeGrantForm model={model} onCreated={() => setAdding(false)} /> : null}
      <div className={styles.stack}>{grants.map((grant) => <RuntimeGrantCard key={`${grant.id}:${grant.revision}`} grant={grant} model={model} />)}</div>
    </article>
  );
}
