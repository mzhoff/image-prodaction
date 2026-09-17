'use client';

import { TextareaControl as PuiTextarea } from '@prodactionpro/ui-core/textarea-control';
import { Input as PuiInput } from '@prodactionpro/ui-core/input';

import type { RuntimeV2Grant } from '@/modules/executable-pipelines/contracts/runtime-v2-descriptor-contracts';
import type { RuntimeConnectionsModel } from '../model/use-runtime-connections';
import { useRuntimeGrantTest } from '../model/use-runtime-grant-test';
import { RuntimeTestResult } from './runtime-test-result';
import styles from './runtime-connections.module.css';

export function RuntimeGrantTest({ grant, model }: { grant: RuntimeV2Grant; model: RuntimeConnectionsModel }) {
  const test = useRuntimeGrantTest(model.workspaceId, model.clientId, grant);
  const disabled = model.mutation || !model.details?.client.enabled || !grant.enabled;
  return (
    <details className={styles.diagnostics}>
      <summary>Проверить версию {grant.pinned.version}</summary>
      <div className={`settings-form ${styles.nestedForm}`}>
        <p className={styles.muted}>Этот тест запускается только по кнопке. Чтобы проверить обновление без изменения рабочего pipeline, создайте для новой версии отдельное разрешение выше.</p>
        <label><span>Входные данные (JSON)</span>
          <PuiTextarea className={styles.jsonInput} spellCheck={false} autoComplete="off" maxLength={50_000}
            value={test.input} disabled={test.busy || Boolean(test.attempt)}
            onChange={(event) => test.setInput(event.target.value)} />
        </label>
        <label><span>Лимит этого теста, USD (необязательно)</span>
          <PuiInput inputMode="decimal" value={test.cap} disabled={test.busy || Boolean(test.attempt)}
            onChange={(event) => test.setCap(event.target.value)} placeholder="Использовать лимит разрешения" />
        </label>
        <p className={styles.muted}>{grant.costPolicy.mode === 'STRICT'
          ? 'Строгий контроль: если провайдер не позволяет гарантировать ограничение, платный вызов будет отклонён.'
          : 'Выбран оценочный контроль. Фактическая стоимость может превысить оценку.'}</p>
        {test.error ? <p className="settings-message settings-message-error" role="alert">{test.error}</p> : null}
        <div className={styles.actions}>
          {!test.run && !test.rejected ? <button type="button" className="settings-primary-button" disabled={disabled || test.busy}
            onClick={() => void test.submit()}>{test.busy ? 'Отправляем…' : test.attempt ? 'Восстановить текущий запуск' : 'Запустить один тест'}</button> : null}
          {test.run ? <button type="button" className="settings-quiet-button" disabled={test.busy}
            onClick={() => void test.read()}>Обновить состояние</button> : null}
          {test.run && !test.terminal ? <button type="button" className="settings-danger-button" disabled={test.busy}
            onClick={() => void test.cancel()}>Отменить запуск</button> : null}
          {test.terminal || test.rejected ? <button type="button" className="settings-quiet-button" onClick={test.reset}>Подготовить новый тест</button> : null}
        </div>
        {test.attempt && !test.run && !test.rejected ? <p className={styles.muted}>Повторная отправка восстановит тот же запрос с теми же данными. Новый платный запуск автоматически не создаётся.</p> : null}
        {test.run ? <RuntimeTestResult run={test.run} workspaceId={model.workspaceId} clientId={model.clientId} /> : null}
      </div>
    </details>
  );
}
