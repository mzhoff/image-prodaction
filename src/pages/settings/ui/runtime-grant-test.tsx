'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Button } from '@prodactionpro/ui-core/button';

import { TextareaControl as PuiTextarea } from '@prodactionpro/ui-core/textarea-control';
import { Input as PuiInput } from '@prodactionpro/ui-core/input';

import type { RuntimeV2Grant } from '@/modules/executable-pipelines/contracts/runtime-v2-descriptor-contracts';
import type { RuntimeConnectionsModel } from '../model/use-runtime-connections';
import { useRuntimeGrantTest } from '../model/use-runtime-grant-test';
import { RuntimeTestResult } from './runtime-test-result';
import styles from './runtime-connections.module.css';

export function RuntimeGrantTest({ grant, model }: { grant: RuntimeV2Grant; model: RuntimeConnectionsModel }) {
  const tUi = useTranslations();
  const test = useRuntimeGrantTest(model.workspaceId, model.clientId, grant);
  const disabled = model.mutation || !model.details?.client.enabled || !grant.enabled;
  return (
    <details className={styles.diagnostics}>
      <summary>{tUi("Проверить версию")} {grant.pinned.version}</summary>
      <div className={`settings-form ${styles.nestedForm}`}>
        <p className={styles.muted}>{tUi("Этот тест запускается только по кнопке. Чтобы проверить обновление без изменения рабочего pipeline, создайте для новой версии отдельное разрешение выше.")}</p>
        <label><span>{tUi("Входные данные (JSON)")}</span>
          <PuiTextarea className={styles.jsonInput} spellCheck={false} autoComplete="off" maxLength={50_000}
            value={test.input} disabled={test.busy || Boolean(test.attempt)}
            onChange={(event) => test.setInput(event.target.value)} />
        </label>
        <label><span>{tUi("Лимит этого теста, USD (необязательно)")}</span>
          <PuiInput inputMode="decimal" value={test.cap} disabled={test.busy || Boolean(test.attempt)}
            onChange={(event) => test.setCap(event.target.value)} placeholder={tUi("Использовать лимит разрешения")} />
        </label>
        <p className={styles.muted}>{grant.costPolicy.mode === 'STRICT'
          ? tUi("Строгий контроль: если провайдер не позволяет гарантировать ограничение, платный вызов будет отклонён.")
          : tUi("Выбран оценочный контроль. Фактическая стоимость может превысить оценку.")}</p>
        {test.error ? <p className="settings-message settings-message-error" role="alert">{test.error}</p> : null}
        <div className={styles.actions}>
          {!test.run && !test.rejected ? <Button size="sm" intent="neutral" appearance="solid" type="button" className="settings-primary-button" disabled={disabled || test.busy}
            onClick={() => void test.submit()}>{test.busy ? tUi("Отправляем…") : test.attempt ? tUi("Восстановить текущий запуск") : tUi("Запустить один тест")}</Button> : null}
          {test.run ? <Button size="sm" intent="neutral" appearance="soft" type="button" className="settings-quiet-button" disabled={test.busy}
            onClick={() => void test.read()}>{tUi("Обновить состояние")}</Button> : null}
          {test.run && !test.terminal ? <Button size="sm" intent="danger" appearance="soft" type="button" className="settings-danger-button" disabled={test.busy}
            onClick={() => void test.cancel()}>{tUi("Отменить запуск")}</Button> : null}
          {test.terminal || test.rejected ? <Button size="sm" intent="neutral" appearance="soft" type="button" className="settings-quiet-button" onClick={test.reset}>{tUi("Подготовить новый тест")}</Button> : null}
        </div>
        {test.attempt && !test.run && !test.rejected ? <p className={styles.muted}>{tUi("Повторная отправка восстановит тот же запрос с теми же данными. Новый платный запуск автоматически не создаётся.")}</p> : null}
        {test.run ? <RuntimeTestResult run={test.run} workspaceId={model.workspaceId} clientId={model.clientId} /> : null}
      </div>
    </details>
  );
}
