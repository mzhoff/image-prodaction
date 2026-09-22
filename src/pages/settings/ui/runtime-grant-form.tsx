'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Button } from '@prodactionpro/ui-core/button';

import { SettingsSelect } from './settings-select';
import { Input as PuiInput } from '@prodactionpro/ui-core/input';

import { useEffect, useState, type FormEvent } from 'react';
import type { RuntimeV2Version } from '@/modules/executable-pipelines/contracts/runtime-v2-descriptor-contracts';
import { runtimeConnectionsApi } from '../api/runtime-connections-api';
import { canPinRuntimeVersion, resolveCatalogReference, runtimeErrorMessage } from '../model/runtime-connections-values';
import type { RuntimeConnectionsModel } from '../model/use-runtime-connections';
import styles from './runtime-connections.module.css';

export function RuntimeGrantForm({ model, onCreated }: { model: RuntimeConnectionsModel; onCreated: () => void }) {
  const tUi = useTranslations();
  const [pipelineId, setPipelineId] = useState('');
  const [reference, setReference] = useState('');
  const [versions, setVersions] = useState<RuntimeV2Version[]>([]);
  const [versionNumber, setVersionNumber] = useState('');
  const [versionsPending, setVersionsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cap, setCap] = useState('');
  const [mode, setMode] = useState<'STRICT' | 'BEST_EFFORT'>('STRICT');
  const pipeline = model.catalog.find((item) => item.publicId === pipelineId);
  const version = versions.find((item) => String(item.version) === versionNumber);
  useEffect(() => {
    if (!pipelineId) return;
    const controller = new AbortController();
    setVersionsPending(true);
    setError(null);
    void runtimeConnectionsApi.listVersions(model.workspaceId, pipelineId, controller.signal).then((response) => {
      if (controller.signal.aborted) return;
      setVersions(response.versions);
      setVersionNumber(String(response.versions[0]?.version ?? ''));
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(runtimeErrorMessage(reason));
    }).finally(() => { if (!controller.signal.aborted) setVersionsPending(false); });
    return () => controller.abort();
  }, [model.workspaceId, pipelineId]);
  function choosePipeline(id: string) {
    setVersions([]);
    setVersionNumber('');
    setError(null);
    setPipelineId(id);
  }
  function resolveReference() {
    const found = resolveCatalogReference(reference, model.catalog);
    if (!found) {
      setError(tUi("Этот pipeline не найден среди опубликованных pipelines выбранного Workspace."));
      return;
    }
    choosePipeline(found.publicId);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pipeline || !version || !canPinRuntimeVersion(version)) return;
    const result = await model.mutate(() => runtimeConnectionsApi.createGrant(model.workspaceId, model.clientId, {
      pipeline: pipeline.publicId, capabilityKey: version.capabilityKey!, version: version.version,
      checksum: version.checksum, inputSchemaChecksum: version.inputSchemaChecksum!, outputSchemaChecksum: version.outputSchemaChecksum!,
      updatePolicy: 'PINNED', executionPolicy: { maxAttempts: 1 },
      costPolicy: { maximumProviderCostUsd: cap.trim() || null, mode },
    }), tUi("Pipeline разрешён. Новые публикации не будут менять закреплённую версию автоматически."));
    if (!result) return;
    await model.refresh();
    onCreated();
  }
  return (
    <form className={`settings-form ${styles.nestedForm}`} onSubmit={(event) => void submit(event)}>
      <h4>{tUi("Разрешить pipeline")}</h4>
      <SettingsSelect label={tUi("Опубликованный Flow")} required value={pipelineId} disabled={model.mutation} onChange={choosePipeline}
        options={[{ value: '', label: tUi("Выберите Flow") }, ...model.catalog.map((item) => ({ value: item.publicId, label: `${item.name}${item.latest.capabilityKey ? '' : tUi(" · назначение не задано")}` }))]} />
      {model.catalog.length === 0 ? <p className={styles.callout}>{tUi("Сначала опубликуйте исполняемый pipeline в конструкторе этого Workspace.")}</p> : null}
      <div className={styles.referenceRow}>
        <label><span>{tUi("Или вставьте ссылку / publicId")}</span><PuiInput value={reference} maxLength={2048}
          disabled={model.mutation} onChange={(event) => setReference(event.target.value)} /></label>
        <Button size="sm" intent="neutral" appearance="soft" className="settings-quiet-button" type="button" disabled={model.mutation || !reference.trim()} onClick={resolveReference}>{tUi("Найти")}</Button>
      </div>
      {versionsPending ? <p className={styles.muted} role="status">{tUi("Загружаем опубликованные версии…")}</p> : null}
      {error ? <p className="settings-message settings-message-error" role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p> : null}
      {versions.length > 0 ? (
        <SettingsSelect label={tUi("Версия")} value={versionNumber} disabled={model.mutation || versionsPending} onChange={setVersionNumber}
          options={versions.map((item) => ({ value: String(item.version), label: tUi("Версия {p1}", { p1: item.version }) }))} />
      ) : null}
      {version ? (
        canPinRuntimeVersion(version)
          ? <p className={styles.muted}>{tUi("Назначение:")}{' '} <strong>{version.capabilityKey}</strong>{tUi(". Обновления применяются вручную.")}</p>
          : <p className={styles.callout}>{tUi("В этой версии не задано назначение (capability) или не зафиксирован формат данных. В конструкторе нажмите правой кнопкой по секции → Integration capability, задайте назначение и выберите Publish executable version. Для первой публикации — Make executable. Старые версии остаются неизменными.")}</p>
      ) : null}
      <label><span>{tUi("Максимальная стоимость одного запуска, USD")}</span>
        <PuiInput inputMode="decimal" pattern="(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,8})?" placeholder={tUi("Не задана")} value={cap}
          disabled={model.mutation} onChange={(event) => setCap(event.target.value)} />
        <small>{tUi("Используйте точку, например 0.05. Более строгий лимит вызывающего приложения тоже учитывается.")}</small></label>
      <div className={styles.selectLabel}>
        <SettingsSelect label={tUi("Контроль расходов")} value={mode} disabled={model.mutation} onChange={(value) => setMode(value as 'STRICT' | 'BEST_EFFORT')}
          options={[{ value: 'STRICT', label: tUi("Строгий лимит") }, { value: 'BEST_EFFORT', label: tUi("Возможен перерасход") }]} />
        <small>{mode === 'STRICT'
          ? tUi("Если провайдер не позволяет гарантировать лимит, платный вызов не начнётся.")
          : tUi("Учитываем уже известные расходы, но верхняя стоимость вызова может быть неизвестна. Вы разрешаете запуск с риском превышения лимита.")}</small>
      </div>
      <Button size="sm" intent="neutral" appearance="solid" className="settings-primary-button" type="submit" disabled={model.mutation || versionsPending || !canPinRuntimeVersion(version)}>
        {model.mutation ? tUi("Сохраняем…") : tUi("Разрешить выбранную версию")}
      </Button>
    </form>
  );
}
