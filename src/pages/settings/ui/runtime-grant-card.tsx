'use client';

import { useEffect, useState } from 'react';
import type { RuntimeV2Grant, RuntimeV2Updates, RuntimeV2Version } from '@/modules/executable-pipelines/contracts/runtime-v2-descriptor-contracts';
import { runtimeConnectionsApi } from '../api/runtime-connections-api';
import { canPinRuntimeVersion, runtimeErrorMessage, runtimeRepinInput } from '../model/runtime-connections-values';
import type { RuntimeConnectionsModel } from '../model/use-runtime-connections';
import { RuntimeGrantTest } from './runtime-grant-test';
import styles from './runtime-connections.module.css';

export function RuntimeGrantCard({ grant, model }: { grant: RuntimeV2Grant; model: RuntimeConnectionsModel }) {
  const [updates, setUpdates] = useState<RuntimeV2Updates | null>(null);
  const [rollbackVersion, setRollbackVersion] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setPending(true);
    setError(null);
    void runtimeConnectionsApi.getUpdates(model.workspaceId, model.clientId, grant.id, controller.signal).then((response) => {
      if (controller.signal.aborted) return;
      setUpdates(response.updates);
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(runtimeErrorMessage(reason));
    }).finally(() => { if (!controller.signal.aborted) setPending(false); });
    return () => controller.abort();
  }, [model.workspaceId, model.clientId, grant.id, grant.pipelinePublicId, grant.revision]);
  async function toggleEnabled() {
    if (grant.enabled && !window.confirm(`Запретить новые запуски «${grant.pipelineName}» для этого приложения? История сохранится.`)) return;
    await model.mutate(() => runtimeConnectionsApi.setGrantEnabled(model.workspaceId, model.clientId,
      grant.id, !grant.enabled, grant.revision), grant.enabled ? 'Новые запуски pipeline запрещены.' : 'Разрешение включено.');
    await model.refresh();
  }
  async function changeVersion(version: RuntimeV2Version, rollback: boolean) {
    if (!window.confirm(`${rollback ? 'Вернуть' : 'Закрепить'} версию ${version.version} для новых запусков? Уже выполняющиеся запуски сохранят свою версию.`)) return;
    const input = runtimeRepinInput(grant.revision, version);
    await model.mutate(() => rollback
      ? runtimeConnectionsApi.rollback(model.workspaceId, model.clientId, grant.id, input)
      : runtimeConnectionsApi.repin(model.workspaceId, model.clientId, grant.id, input),
    `Для новых запусков закреплена версия ${version.version}.`);
    await model.refresh();
  }
  async function createCandidate() {
    if (!updates || !canPinRuntimeVersion(updates.latest)) return;
    const version = updates.latest;
    await model.mutate(() => runtimeConnectionsApi.createGrant(model.workspaceId, model.clientId, {
      pipeline: grant.pipelinePublicId, capabilityKey: version.capabilityKey!, version: version.version,
      checksum: version.checksum, inputSchemaChecksum: version.inputSchemaChecksum!, outputSchemaChecksum: version.outputSchemaChecksum!,
      updatePolicy: 'PINNED', executionPolicy: grant.executionPolicy, costPolicy: grant.costPolicy,
    }), `Создано отдельное разрешение на версию ${version.version}. Проверьте его ниже. Рабочая версия ${grant.pinned.version} не изменилась.`);
    await model.refresh();
  }
  const previous = updates?.rollbackVersions.filter((version) => canPinRuntimeVersion(version)) ?? [];
  const chosenRollback = previous.find((version) => String(version.version) === rollbackVersion);
  const incompatible = updates ? [updates.compatibility.structural, updates.compatibility.input,
    updates.compatibility.output, updates.compatibility.semantic, updates.compatibility.capability].includes('INCOMPATIBLE') : false;
  const blocked = model.mutation || pending || !model.canManage || !model.details?.client.enabled;
  return (
    <div className={styles.grant}>
      <header className={styles.cardHeader}>
        <div><h4>{grant.pipelineName}</h4><p className={styles.muted}>Версия {grant.pinned.version} · {grant.enabled ? 'разрешён' : 'отключён'}</p></div>
        {model.canManage ? <button className="settings-quiet-button" type="button" disabled={model.mutation}
          onClick={() => void toggleEnabled()}>{grant.enabled ? 'Отключить' : 'Включить'}</button> : null}
      </header>
      <p className={styles.muted}>Назначение: {grant.capabilityKey}</p>
      <p className={styles.muted}>Лимит: {grant.costPolicy.maximumProviderCostUsd === null ? 'не задан' : `$${grant.costPolicy.maximumProviderCostUsd}`}
        {' · '}{grant.costPolicy.mode === 'STRICT' ? 'строгий контроль' : 'без гарантии лимита, возможен перерасход'}</p>
      {pending ? <p className={styles.muted} role="status">Проверяем обновления…</p> : null}
      {error ? <p className="settings-message settings-message-error" role="alert">{error}</p> : null}
      {updates?.updateAvailable ? (
        <div className={styles.update}>
          <strong>Доступна версия {updates.latest.version}</strong>
          <p>{incompatible ? 'Изменился формат или назначение. Текущее разрешение нельзя перевести на эту версию.'
            : 'Обновление не применено. Проверьте новую версию перед переключением.'}</p>
          {updates.compatibility.behavioralChange ? <p>Внутренняя логика изменилась: результат может отличаться даже при прежнем формате данных.</p> : null}
          <p>Изменение стоимости пока неизвестно. Автоматическое обновление выключено.</p>
          {model.canManage ? <div className={styles.actions}>
            <button className="settings-quiet-button" type="button" disabled={blocked || !canPinRuntimeVersion(updates.latest)}
              onClick={() => void createCandidate()}>Создать отдельное разрешение для проверки</button>
            <button className="settings-primary-button" type="button"
              disabled={blocked || incompatible || !canPinRuntimeVersion(updates.latest)}
              onClick={() => void changeVersion(updates.latest, false)}>Закрепить версию {updates.latest.version}</button>
          </div> : null}
        </div>
      ) : updates ? <p className={styles.muted}>Закреплена последняя опубликованная версия.</p> : null}
      {model.canManage && previous.length > 0 ? (
        <div className={styles.referenceRow}>
          <label className={styles.selectLabel}>Вернуться к прежней версии
            <select value={rollbackVersion} disabled={blocked} onChange={(event) => setRollbackVersion(event.target.value)}>
              <option value="">Выберите версию</option>
              {previous.map((version) => <option value={version.version} key={version.version}>Версия {version.version}</option>)}
            </select>
          </label>
          <button className="settings-quiet-button" type="button" disabled={blocked || !chosenRollback}
            onClick={() => chosenRollback && void changeVersion(chosenRollback, true)}>Вернуть</button>
        </div>
      ) : null}
      <details className={styles.diagnostics}>
        <summary>Формат данных и диагностика</summary>
        <dl><dt>ID разрешения</dt><dd>{grant.id}</dd><dt>Pipeline</dt><dd>{grant.pipelinePublicId}</dd>
          <dt>Ревизия разрешения</dt><dd>{grant.revision}</dd><dt>Checksum</dt><dd>{grant.pinned.checksum}</dd>
          <dt>Вход</dt><dd>{grant.pinned.inputSchemaChecksum}</dd><dt>Выход</dt><dd>{grant.pinned.outputSchemaChecksum}</dd></dl>
        <p>На вход: {describeFields(grant.input.fields)}</p><p>На выход: {describeFields(grant.output.fields)}</p>
        {updates ? <p>Причины ручного обновления: {updates.compatibility.autoRepinDeniedReasons.join(', ') || 'Политика PINNED'}</p> : null}
      </details>
      {model.canManage ? <RuntimeGrantTest key={`${grant.id}:${grant.revision}`} grant={grant} model={model} /> : null}
    </div>
  );
}

function describeFields(fields: RuntimeV2Grant['input']['fields']) {
  return Object.entries(fields).map(([name, field]) => `${name}: ${field.kind}${field.required ? ' (обязательно)' : ''}`).join(', ') || 'нет полей';
}
