import Image from 'next/image';
import { CheckCircle2, CircleAlert, FileImage, LoaderCircle } from 'lucide-react';
import type { PipelinePlaygroundDescriptor, PipelinePlaygroundOutput,
  PipelinePlaygroundRun } from '@/modules/executable-pipelines/contracts/pipeline-playground-contracts';
import type { PipelineValue } from '@/modules/executable-pipelines/contracts/pipeline-contracts';
import { isArtifactReference } from '../model/pipeline-playground-values';

export function PipelineResult({ descriptor, error, run }: {
  descriptor: PipelinePlaygroundDescriptor | null;
  error: string | null;
  run: PipelinePlaygroundRun | null;
}) {
  return (
    <section className="playground-result-card" aria-labelledby="playground-result-title">
      <div className="playground-section-heading">
        <span className="playground-step">03</span>
        <div><h2 id="playground-result-title">Result</h2>
          <p>The response appears here after the server worker completes the run.</p></div>
      </div>
      {error ? <p className="playground-message playground-message-error" role="alert">
        <CircleAlert size={15} />{error}
      </p> : null}
      {!run && !error ? <div className="playground-result-placeholder">
        <FileImage size={28} /><span>No run yet</span>
      </div> : null}
      {run ? <RunResult descriptor={descriptor} run={run} /> : null}
    </section>
  );
}

function RunResult({ descriptor, run }: {
  descriptor: PipelinePlaygroundDescriptor | null;
  run: PipelinePlaygroundRun;
}) {
  return (
    <div className="playground-run-result">
      <div className="playground-run-meta">
        <StatusBadge status={run.status} /><code>{run.id}</code>
        <span>Attempt {run.attemptCount}/{run.maxAttempts}</span>
        {run.usage?.totalTokens ? <span>{run.usage.totalTokens} tokens</span> : null}
        {run.usage?.actualCostUsd ? <span>${run.usage.actualCostUsd}</span> : null}
      </div>
      {run.status === 'failed' && run.error ? (
        <p className="playground-message playground-message-error">
          <CircleAlert size={15} />{run.error.message}
        </p>
      ) : null}
      {run.status === 'queued' || run.status === 'running' ? (
        <div className="playground-result-loading">
          <LoaderCircle className="playground-spinner" size={22} />
          <span>{run.status === 'queued' ? 'Waiting for a worker…' : 'Pipeline is running…'}</span>
        </div>
      ) : null}
      {run.status === 'succeeded' && run.outputs && descriptor ? (
        <div className="playground-output-list">{descriptor.outputs.map((output) => (
          <PipelineOutputValue key={output.name} output={output} value={run.outputs?.[output.name]} />
        ))}</div>
      ) : null}
    </div>
  );
}

function PipelineOutputValue({ output, value }: {
  output: PipelinePlaygroundOutput;
  value: PipelineValue | undefined;
}) {
  return (
    <article className="playground-output">
      <div className="playground-output-title">
        <strong>{output.label}</strong><span>{output.name} · {output.kind}</span>
      </div>
      <OutputContent label={output.label} value={value} />
    </article>
  );
}

function OutputContent({ label, value }: { label: string; value: PipelineValue | undefined }) {
  if (isArtifactReference(value)) {
    return (
      <div className="playground-output-image">
        <Image alt={label} height={value.height ?? 768}
          src={`/api/assets/${encodeURIComponent(value.assetId)}/content`}
          unoptimized width={value.width ?? 1024} />
        <a href={`/api/assets/${encodeURIComponent(value.assetId)}/content`} download>
          Download result
        </a>
      </div>
    );
  }
  if (Array.isArray(value) && value.every(isArtifactReference)) {
    return <div className="playground-output-image-grid">{value.map((artifact, index) => (
      <OutputContent key={`${artifact.assetId}-${index}`} label={`${label} ${index + 1}`} value={artifact} />
    ))}</div>;
  }
  if (typeof value === 'string') return <pre>{value}</pre>;
  return <pre>{JSON.stringify(value ?? null, null, 2)}</pre>;
}

function StatusBadge({ status }: { status: PipelinePlaygroundRun['status'] }) {
  return (
    <span className={`playground-status playground-status-${status}`}>
      {status === 'queued' || status === 'running'
        ? <LoaderCircle className="playground-spinner" size={12} />
        : status === 'succeeded' ? <CheckCircle2 size={12} /> : <CircleAlert size={12} />}
      {status}
    </span>
  );
}
