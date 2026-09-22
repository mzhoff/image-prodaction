'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Button } from '@prodactionpro/ui-core/button';

import { useEffect, useState } from 'react';
import type { RuntimeV2Grant, RuntimeV2Updates, RuntimeV2Version } from '@/modules/executable-pipelines/contracts/runtime-v2-descriptor-contracts';
import { runtimeConnectionsApi } from '../api/runtime-connections-api';
import { canPinRuntimeVersion, runtimeErrorMessage, runtimeRepinInput } from '../model/runtime-connections-values';
import type { RuntimeConnectionsModel } from '../model/use-runtime-connections';
import { RuntimeGrantTest } from './runtime-grant-test';
import styles from './runtime-connections.module.css';

export function RuntimeGrantCard({ grant, model }: { grant: RuntimeV2Grant; model: RuntimeConnectionsModel }) {
  const tUi = useTranslations();
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
    if (grant.enabled && !window.confirm(tUi("Запретить новые запуски «{p1}» для этого приложения? История сохранится.", { p1: grant.pipelineName }))) return;
    await model.mutate(() => runtimeConnectionsApi.setGrantEnabled(model.workspaceId, model.clientId,
      grant.id, !grant.enabled, grant.revision), grant.enabled ? tUi("Новые запуски pipeline запрещены.") : tUi("Разрешение включено."));
    await model.refresh();
  }
  async function changeVersion(version: RuntimeV2Version, rollback: boolean) {
    if (!window.confirm(tUi("{p1} версию {p2} для новых запусков? Уже выполняющиеся запуски сохранят свою версию.", { p1: rollback ? 'Вернуть' : 'Закрепить', p2: version.version }))) return;
    const input = runtimeRepinInput(grant.revision, version);
    await model.mutate(() => rollback
      ? runtimeConnectionsApi.rollback(model.workspaceId, model.clientId, grant.id, input)
      : runtimeConnectionsApi.repin(model.workspaceId, model.clientId, grant.id, input),
    tUi("Для новых запусков закреплена версия {p1}.", { p1: version.version }));
    await model.refresh();
  }
  async function createCandidate() {
    if (!updates || !canPinRuntimeVersion(updates.latest)) return;
    const version = updates.latest;
    await model.mutate(() => runtimeConnectionsApi.createGrant(model.workspaceId, model.clientId, {
      pipeline: grant.pipelinePublicId, capabilityKey: version.capabilityKey!, version: version.version,
      checksum: version.checksum, inputSchemaChecksum: version.inputSchemaChecksum!, outputSchemaChecksum: version.outputSchemaChecksum!,
      updatePolicy: 'PINNED', executionPolicy: grant.executionPolicy, costPolicy: grant.costPolicy,
    }), tUi("Создано отдельное разрешение на версию {p1}. Проверьте его ниже. Рабочая версия {p2} не изменилась.", { p1: version.version, p2: grant.pinned.version }));
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
        <div><h4>{grant.pipelineName}</h4><p className={styles.muted}>{tUi("Версия")}{' '} {grant.pinned.version} · {grant.enabled ? tUi("разрешён") : tUi("отключён")}</p></div>
        {model.canManage ? <Button size="sm" intent="neutral" appearance="soft" className="settings-quiet-button" type="button" disabled={model.mutation}
          onClick={() => void toggleEnabled()}>{grant.enabled ? tUi("Отключить") : tUi("Включить")}</Button> : null}
      </header>
      <p className={styles.muted}>{tUi("Назначение:")}{' '} {grant.capabilityKey}</p>
      <p className={styles.muted}>{tUi("Лимит:")}{' '} {grant.costPolicy.maximumProviderCostUsd === null ? tUi("не задан") : `$${grant.costPolicy.maximumProviderCostUsd}`}
        {' · '}{grant.costPolicy.mode === 'STRICT' ? tUi("строгий контроль") : tUi("без гарантии лимита, возможен перерасход")}</p>
      {pending ? <p className={styles.muted} role="status">{tUi("Проверяем обновления…")}</p> : null}
      {error ? <p className="settings-message settings-message-error" role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p> : null}
      {updates?.updateAvailable ? (
        <div className={styles.update}>
          <strong>{tUi("Доступна версия")}{' '} {updates.latest.version}</strong>
          <p>{incompatible ? tUi("Изменился формат или назначение. Текущее разрешение нельзя перевести на эту версию.")
            : tUi("Обновление не применено. Проверьте новую версию перед переключением.")}</p>
          {updates.compatibility.behavioralChange ? <p>{tUi("Внутренняя логика изменилась: результат может отличаться даже при прежнем формате данных.")}</p> : null}
          <p>{tUi("Изменение стоимости пока неизвестно. Автоматическое обновление выключено.")}</p>
          {model.canManage ? <div className={styles.actions}>
            <Button size="sm" intent="neutral" appearance="soft" className="settings-quiet-button" type="button" disabled={blocked || !canPinRuntimeVersion(updates.latest)}
              onClick={() => void createCandidate()}>{tUi("Создать отдельное разрешение для проверки")}</Button>
            <Button size="sm" intent="neutral" appearance="solid" className="settings-primary-button" type="button"
              disabled={blocked || incompatible || !canPinRuntimeVersion(updates.latest)}
              onClick={() => void changeVersion(updates.latest, false)}>{tUi("Закрепить версию")}{' '} {updates.latest.version}</Button>
          </div> : null}
        </div>
      ) : updates ? <p className={styles.muted}>{tUi("Закреплена последняя опубликованная версия.")}</p> : null}
      {model.canManage && previous.length > 0 ? (
        <div className={styles.referenceRow}>
          <label className={styles.selectLabel}>{tUi("Вернуться к прежней версии")}<select value={rollbackVersion} disabled={blocked} onChange={(event) => setRollbackVersion(event.target.value)}>
              <option value="">{tUi("Выберите версию")}</option>
              {previous.map((version) => <option value={version.version} key={version.version}>{tUi("Версия")}{' '} {version.version}</option>)}
            </select>
          </label>
          <Button size="sm" intent="neutral" appearance="soft" className="settings-quiet-button" type="button" disabled={blocked || !chosenRollback}
            onClick={() => chosenRollback && void changeVersion(chosenRollback, true)}>{tUi("Вернуть")}</Button>
        </div>
      ) : null}
      <details className={styles.diagnostics}>
        <summary>{tUi("Формат данных и диагностика")}</summary>
        <dl><dt>{tUi("ID разрешения")}</dt><dd>{grant.id}</dd><dt>Pipeline</dt><dd>{grant.pipelinePublicId}</dd>
          <dt>{tUi("Ревизия разрешения")}</dt><dd>{grant.revision}</dd><dt>Checksum</dt><dd>{grant.pinned.checksum}</dd>
          <dt>{tUi("Вход")}</dt><dd>{grant.pinned.inputSchemaChecksum}</dd><dt>{tUi("Выход")}</dt><dd>{grant.pinned.outputSchemaChecksum}</dd></dl>
        <p>{tUi("На вход:")}{' '} {tUi(describeFields(grant.input.fields))}</p><p>{tUi("На выход:")}{' '} {tUi(describeFields(grant.output.fields))}</p>
        {updates ? <p>{tUi("Причины ручного обновления:")}{' '} {updates.compatibility.autoRepinDeniedReasons.join(', ') || tUi("Политика PINNED")}</p> : null}
      </details>
      {model.canManage ? <RuntimeGrantTest key={`${grant.id}:${grant.revision}`} grant={grant} model={model} /> : null}
    </div>
  );
}

function describeFields(fields: RuntimeV2Grant['input']['fields']) {
  return Object.entries(fields).map(([name, field]) => `${name}: ${field.kind}${field.required ? ' (обязательно)' : ''}`).join(', ') || 'нет полей';
}
