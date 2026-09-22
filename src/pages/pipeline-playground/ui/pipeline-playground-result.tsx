'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';
import { CheckCircle2, CircleAlert, Download, LoaderCircle, Sparkles } from '@prodactionpro/ui-core/icons';
import type { PipelinePlaygroundDescriptor, PipelinePlaygroundOutput, PipelinePlaygroundRun } from '@/modules/executable-pipelines/contracts/pipeline-playground-contracts';
import type { PipelineValue } from '@/modules/executable-pipelines/contracts/pipeline-contracts';
import { isArtifactReference } from '../model/pipeline-playground-values';
import { PIPELINE_KIND_LABELS } from '../model/pipeline-field-presentation';
import { PipelineMediaPreview } from './pipeline-media-input';

export function PipelineResult({ descriptor, error, run, onRefresh }: {
  descriptor: PipelinePlaygroundDescriptor | null; error: string | null; run: PipelinePlaygroundRun | null; onRefresh(): void;
}) {
  const tUi = useTranslations();
  const ui_PIPELINE_KIND_LABELS = useUiCatalog(PIPELINE_KIND_LABELS, tUi);
  return <section className="playground-result-card" aria-labelledby="playground-result-title">
    <div className="playground-section-heading"><div><span className="playground-eyebrow">OUTPUT</span><h2 id="playground-result-title">{tUi("Результат")}</h2><p>{tUi("Посмотрите, что получилось, и попробуйте другие входные данные.")}</p></div>
      {run ? <StatusBadge status={run.status} /> : null}</div>
    {error ? <div className="playground-message playground-message-error" role="alert"><CircleAlert size={16} /><span>{typeof (error) === 'string' ? tUi((error) as string) : (error)}</span>
      {run && !['succeeded', 'failed', 'canceled'].includes(run.status) ? <button className="playground-button" type="button" onClick={onRefresh}>{tUi("Обновить статус")}</button> : null}</div> : null}
    {!run ? <div className="playground-result-placeholder"><span className="playground-result-symbol"><Sparkles size={34} /></span><strong>{tUi("Место для результата")}</strong>
      <span>{descriptor ? tUi("Добавьте материалы слева и запустите pipeline.") : tUi("Выберите pipeline, чтобы начать.")}</span>
      {descriptor?.outputs.length ? <div className="playground-expected-outputs">{descriptor.outputs.map((output) => <span key={output.name}>{ui_PIPELINE_KIND_LABELS[output.kind]}</span>)}</div> : null}</div> : null}
    {run ? <RunResult descriptor={descriptor} run={run} /> : null}
  </section>;
}

function RunResult({ descriptor, run }: { descriptor: PipelinePlaygroundDescriptor | null; run: PipelinePlaygroundRun }) {
  const tUi = useTranslations();
  return <div className="playground-run-result">
    {run.status === 'failed' && run.error ? <p className="playground-message playground-message-error" role="alert"><CircleAlert size={15} />{tUi(run.error.message)}</p> : null}
    {run.status === 'queued' || run.status === 'running' ? <div className="playground-result-loading" role="status"><LoaderCircle className="playground-spinner" size={28} />
      <strong>{run.status === 'queued' ? tUi("Готовимся к запуску…") : tUi("Pipeline работает…")}</strong><span>{tUi("Результат появится здесь автоматически.")}</span></div> : null}
    {run.status === 'succeeded' && run.outputs && descriptor ? <div className="playground-output-list">{descriptor.outputs.map((output) => <PipelineOutputValue key={output.name} output={output} value={run.outputs?.[output.name]} />)}</div> : null}
    {run.status === 'canceled' ? <div className="playground-placeholder">{tUi("Запуск остановлен. Можно запустить pipeline ещё раз.")}</div> : null}
    <details className="playground-run-details"><summary>{tUi("Сведения о запуске")}{run.usage?.actualCostUsd ? ` · $${run.usage.actualCostUsd}` : ''}</summary><div className="playground-run-meta">
      <span>{tUi("Попытка")}{' '} {run.attemptCount} / {run.maxAttempts}</span>{run.usage?.totalTokens ? <span>{run.usage.totalTokens}  {' '}{tUi("токенов")}</span> : null}<code>{run.id}</code></div></details>
  </div>;
}

function PipelineOutputValue({ output, value }: { output: PipelinePlaygroundOutput; value: PipelineValue | undefined }) {
  const tUi = useTranslations();
  const ui_PIPELINE_KIND_LABELS = useUiCatalog(PIPELINE_KIND_LABELS, tUi);
  return <article className="playground-output"><div className="playground-output-title"><strong>{output.label}</strong><span>{ui_PIPELINE_KIND_LABELS[output.kind]}</span></div>
    <OutputContent label={output.label} value={value} />
  </article>;
}
function OutputContent({ label, value }: { label: string; value: PipelineValue | undefined }) {
  const tUi = useTranslations();
  if (isArtifactReference(value)) return <div className="playground-output-media"><PipelineMediaPreview key={value.assetId} artifact={value} label={label} />
    <a href={`/api/assets/${encodeURIComponent(value.assetId)}/content`} download><Download size={14} />{tUi("Скачать результат")}</a></div>;
  if (Array.isArray(value) && value.length > 0 && value.every(isArtifactReference)) return <div className="playground-output-image-grid">{value.map((artifact, index) => <OutputContent key={`${artifact.assetId}-${index}`} label={`${label} ${index + 1}`} value={artifact} />)}</div>;
  return <pre>{typeof value === 'string' ? value : JSON.stringify(value ?? null, null, 2)}</pre>;
}
function StatusBadge({ status }: { status: PipelinePlaygroundRun['status'] }) {
  const tUi = useTranslations();
  const active = status === 'queued' || status === 'running';
  return <span className={`playground-status playground-status-${status}`}>
    {active ? <LoaderCircle className="playground-spinner" size={12} /> : status === 'succeeded' ? <CheckCircle2 size={12} /> : <CircleAlert size={12} />}
    {{ queued: tUi("В очереди"), running: tUi("В работе"), succeeded: tUi("Готово"), failed: tUi("Ошибка"), canceled: tUi("Остановлен") }[status]}
  </span>;
}
