import Image from 'next/image';
import type { RuntimeV2Run } from '@/modules/executable-pipelines/contracts/runtime-v2-run-contracts';
import { runtimeArtifactPath } from '../model/runtime-grant-test-values';
import styles from './runtime-connections.module.css';

const statusLabels: Record<RuntimeV2Run['status'], string> = {
  queued: 'В очереди', running: 'Выполняется', succeeded: 'Готово', failed: 'Ошибка', canceled: 'Отменён',
};
const usageLabels: Record<RuntimeV2Run['usage']['state'], string> = {
  PENDING: 'Ожидаем данные провайдера', PARTIAL: 'Стоимость известна не полностью',
  COMPLETE: 'Стоимость подтверждена', UNAVAILABLE: 'Стоимость недоступна',
};

export function RuntimeTestResult({ run, workspaceId, clientId }: { run: RuntimeV2Run; workspaceId: string; clientId: string }) {
  return (
    <div className={styles.result}>
      <p role="status"><strong>{statusLabels[run.status]}</strong> · версия {run.pipeline.version}</p>
      <p className={styles.muted}>{usageLabels[run.usage.state]}: {run.usage.actualProviderCostUsd === null ? 'неизвестно' : `$${run.usage.actualProviderCostUsd}`}</p>
      {run.usage.knownProviderCostUsd !== null && run.usage.state !== 'COMPLETE' ? <p className={styles.muted}>Подтверждённая часть: ${run.usage.knownProviderCostUsd}</p> : null}
      <p className={styles.muted}>Вызовов провайдера: {run.usage.providerCallCount} · с известной стоимостью: {run.usage.pricedCallCount}</p>
      {run.error ? <p className="settings-message settings-message-error" role="alert">Запуск завершился с ошибкой: {run.error.code}. Автоматический повтор не выполняется.</p> : null}
      {Object.entries(run.outputs ?? {}).map(([name, output]) => {
        if (typeof output === 'string') return <div key={name}><strong>{name}</strong><pre className={styles.textResult}>{output}</pre></div>;
        if (output && typeof output === 'object' && !Array.isArray(output) && output.kind === 'image') {
          const path = runtimeArtifactPath(workspaceId, clientId, run.id, output.assetId);
          if (!path) return null;
          const width = typeof output.width === 'number' && output.width > 0 ? output.width : 960;
          const height = typeof output.height === 'number' && output.height > 0 ? output.height : 640;
          return <figure className={styles.preview} key={name}>
            <Image unoptimized src={path} width={width} height={height} alt={`Результат теста: ${name}`} />
            <figcaption><a href={path} download rel="noreferrer">Скачать {name}</a></figcaption>
          </figure>;
        }
        return <div key={name}><strong>{name}</strong><pre className={styles.textResult}>{JSON.stringify(output, null, 2)}</pre></div>;
      })}
      <details className={styles.diagnostics}><summary>Диагностика запуска</summary><dl>
        <dt>ID</dt><dd>{run.id}</dd><dt>Grant</dt><dd>{run.grantId}</dd>
        <dt>Попытки</dt><dd>{run.attemptCount}</dd><dt>Контроль бюджета</dt><dd>{run.cost.enforcement}</dd>
        <dt>Checksum</dt><dd>{run.pipeline.checksum}</dd>
      </dl></details>
    </div>
  );
}
