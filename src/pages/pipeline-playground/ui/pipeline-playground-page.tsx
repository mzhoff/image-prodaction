'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  CircleAlert,
  FileImage,
  LoaderCircle,
  Play,
  PlugZap,
  RotateCcw,
  Upload,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  PipelinePlaygroundDescriptor,
  PipelinePlaygroundField,
  PipelinePlaygroundOutput,
  PipelinePlaygroundRun,
} from '@/modules/executable-pipelines/contracts/pipeline-playground-contracts';
import type {
  PipelineArtifactReference,
  PipelineValue,
} from '@/modules/executable-pipelines/contracts/pipeline-contracts';
import {
  createPipelinePlaygroundRun,
  fetchPipelinePlaygroundDescriptor,
  fetchPipelinePlaygroundRun,
  uploadPipelinePlaygroundImage,
} from '@/modules/executable-pipelines/adapters/client/pipeline-playground-api';
import { createId } from '@/shared/lib/id';
import {
  buildPipelinePlaygroundInput,
  type PipelinePlaygroundDraft,
} from '../model/pipeline-playground-inputs';

const TERMINAL_STATUSES = new Set(['canceled', 'failed', 'succeeded']);

interface PipelinePlaygroundPageProps {
  initialEndpoint?: string;
}

export function PipelinePlaygroundPage({ initialEndpoint = '' }: PipelinePlaygroundPageProps) {
  const router = useRouter();
  const [endpoint, setEndpoint] = useState(initialEndpoint);
  const [descriptor, setDescriptor] = useState<PipelinePlaygroundDescriptor | null>(null);
  const [drafts, setDrafts] = useState<Record<string, PipelinePlaygroundDraft>>({});
  const [uploadingFields, setUploadingFields] = useState<Set<string>>(() => new Set());
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [connectionPending, setConnectionPending] = useState(false);
  const [executionPending, setExecutionPending] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [run, setRun] = useState<PipelinePlaygroundRun | null>(null);
  const initialConnectionRef = useRef<string | null>(null);
  const inputBuild = useMemo(() => buildPipelinePlaygroundInput(
    descriptor?.inputs ?? [],
    drafts,
    uploadingFields,
  ), [descriptor?.inputs, drafts, uploadingFields]);
  const runActive = Boolean(run && !TERMINAL_STATUSES.has(run.status));
  const executeDisabled = !descriptor
    || !inputBuild.ready
    || connectionPending
    || executionPending
    || runActive;

  const connectPipeline = useCallback(async (
    value: string,
    options: { signal?: AbortSignal; updateUrl?: boolean } = {},
  ) => {
    const normalized = value.trim();
    if (!normalized) {
      setConnectionError('Paste a pipeline endpoint first.');
      return;
    }
    setConnectionPending(true);
    setConnectionError(null);
    setExecutionError(null);
    setRun(null);
    try {
      const connected = await fetchPipelinePlaygroundDescriptor(normalized, options.signal);
      setDescriptor(connected);
      setDrafts(createInitialDrafts(connected.inputs));
      setUploadingFields(new Set());
      setUploadErrors({});
      if (options.updateUrl !== false) {
        router.replace(`/playground?endpoint=${encodeURIComponent(normalized)}`, { scroll: false });
      }
    } catch (error) {
      if (options.signal?.aborted) return;
      setDescriptor(null);
      setDrafts({});
      setConnectionError(error instanceof Error ? error.message : 'Pipeline could not be connected.');
    } finally {
      if (!options.signal?.aborted) setConnectionPending(false);
    }
  }, [router]);

  useEffect(() => {
    const normalized = initialEndpoint.trim();
    if (!normalized || initialConnectionRef.current === normalized) return undefined;
    initialConnectionRef.current = normalized;
    const controller = new AbortController();
    void connectPipeline(normalized, { signal: controller.signal, updateUrl: false });
    return () => controller.abort();
  }, [connectPipeline, initialEndpoint]);

  useEffect(() => {
    if (!run || TERMINAL_STATUSES.has(run.status)) return undefined;
    const controller = new AbortController();
    let active = true;
    const poll = async () => {
      while (active && !controller.signal.aborted) {
        await wait(900, controller.signal).catch(() => undefined);
        if (!active || controller.signal.aborted) return;
        try {
          const current = await fetchPipelinePlaygroundRun(run.id, controller.signal);
          setRun(current);
          if (TERMINAL_STATUSES.has(current.status)) return;
        } catch (error) {
          if (controller.signal.aborted) return;
          setExecutionError(error instanceof Error ? error.message : 'Pipeline result could not be loaded.');
          return;
        }
      }
    };
    void poll();
    return () => {
      active = false;
      controller.abort();
    };
  }, [run?.id]);

  const changeEndpoint = (value: string) => {
    setEndpoint(value);
    setDescriptor(null);
    setDrafts({});
    setRun(null);
    setConnectionError(null);
    setExecutionError(null);
  };

  const changeDraft = (name: string, value: PipelinePlaygroundDraft) => {
    setDrafts((current) => ({ ...current, [name]: value }));
    setUploadErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
    setRun(null);
    setExecutionError(null);
  };

  const uploadFiles = async (field: PipelinePlaygroundField, files: File[]) => {
    if (!descriptor || files.length === 0) return;
    setUploadingFields((current) => new Set(current).add(field.name));
    setUploadErrors((current) => {
      const next = { ...current };
      delete next[field.name];
      return next;
    });
    try {
      const uploaded = await Promise.all(files.map((file) => (
        uploadPipelinePlaygroundImage(file, descriptor.workspaceId)
      )));
      changeDraft(field.name, field.kind === 'image_collection' ? uploaded : uploaded[0]);
    } catch (error) {
      setUploadErrors((current) => ({
        ...current,
        [field.name]: error instanceof Error ? error.message : 'Image could not be uploaded.',
      }));
    } finally {
      setUploadingFields((current) => {
        const next = new Set(current);
        next.delete(field.name);
        return next;
      });
    }
  };

  const executePipeline = async () => {
    if (!descriptor || executeDisabled) return;
    setExecutionPending(true);
    setExecutionError(null);
    setRun(null);
    try {
      const created = await createPipelinePlaygroundRun({
        idempotencyKey: createId('playground'),
        input: inputBuild.input,
        publicId: descriptor.publicId,
      });
      setRun(created);
    } catch (error) {
      setExecutionError(error instanceof Error ? error.message : 'Pipeline run could not be started.');
    } finally {
      setExecutionPending(false);
    }
  };

  return (
    <>
      <header className="workspace-header playground-header">
        <div>
          <h1>Playground</h1>
          <p>Connect an executable pipeline, fill its inputs and inspect the server result.</p>
        </div>
      </header>

      <div className="workspace-content playground-content">
        <section className="playground-connect-card" aria-labelledby="playground-connect-title">
          <div className="playground-section-heading">
            <span className="playground-step">01</span>
            <div>
              <h2 id="playground-connect-title">Pipeline endpoint</h2>
              <p>Paste a runtime URL from the Pipelines section.</p>
            </div>
          </div>
          <form
            className="playground-endpoint-form"
            onSubmit={(event) => {
              event.preventDefault();
              void connectPipeline(endpoint);
            }}
          >
            <label>
              <span>Endpoint URL</span>
              <input
                aria-describedby={connectionError ? 'playground-connection-error' : undefined}
                onChange={(event) => changeEndpoint(event.target.value)}
                placeholder="http://localhost:3004/v1/pipelines/pln_…/runs"
                spellCheck={false}
                inputMode="url"
                type="text"
                value={endpoint}
              />
            </label>
            <button disabled={connectionPending || !endpoint.trim()} type="submit">
              {connectionPending ? <LoaderCircle className="playground-spinner" size={16} /> : <PlugZap size={16} />}
              {connectionPending ? 'Connecting…' : 'Connect'}
            </button>
          </form>
          {connectionError ? (
            <p className="playground-message playground-message-error" id="playground-connection-error" role="alert">
              <CircleAlert size={15} />
              {connectionError}
            </p>
          ) : null}
          {descriptor ? <PipelineSummary descriptor={descriptor} /> : null}
        </section>

        <section className="playground-input-card" aria-labelledby="playground-input-title">
          <div className="playground-section-heading">
            <span className="playground-step">02</span>
            <div>
              <h2 id="playground-input-title">Input</h2>
              <p>Required fields must be filled before execution.</p>
            </div>
          </div>

          {!descriptor ? (
            <div className="playground-placeholder">Connect a pipeline to load its input schema.</div>
          ) : descriptor.inputs.length === 0 ? (
            <div className="playground-placeholder">This pipeline has no external inputs.</div>
          ) : (
            <div className="playground-fields">
              {descriptor.inputs.map((field) => (
                <PipelineInputField
                  draft={drafts[field.name]}
                  error={uploadErrors[field.name] ?? inputBuild.errors[field.name]}
                  field={field}
                  key={field.name}
                  onChange={(value) => changeDraft(field.name, value)}
                  onUpload={(files) => void uploadFiles(field, files)}
                  uploading={uploadingFields.has(field.name)}
                />
              ))}
            </div>
          )}

          <div className="playground-execute-row">
            <span>
              {descriptor && !inputBuild.ready
                ? 'Complete all required inputs to continue.'
                : 'Each click creates a new durable pipeline run.'}
            </span>
            <button
              className="playground-execute-button"
              disabled={executeDisabled}
              onClick={() => void executePipeline()}
              type="button"
            >
              {executionPending || runActive
                ? <LoaderCircle className="playground-spinner" size={17} />
                : run?.status === 'succeeded'
                  ? <RotateCcw size={17} />
                  : <Play fill="currentColor" size={17} />}
              {executionPending ? 'Starting…' : runActive ? 'Running…' : run?.status === 'succeeded' ? 'Run again' : 'Run pipeline'}
            </button>
          </div>
        </section>

        <PipelineResult
          descriptor={descriptor}
          error={executionError}
          run={run}
        />
      </div>
    </>
  );
}

function PipelineSummary({ descriptor }: { descriptor: PipelinePlaygroundDescriptor }) {
  return (
    <div className="playground-pipeline-summary">
      <div>
        <CheckCircle2 size={18} />
        <div>
          <strong>{descriptor.name}</strong>
          <span>Executable · v{descriptor.version}</span>
        </div>
      </div>
      <code>{descriptor.publicId}</code>
    </div>
  );
}

function PipelineInputField({
  draft,
  error,
  field,
  onChange,
  onUpload,
  uploading,
}: {
  draft: PipelinePlaygroundDraft;
  error?: string;
  field: PipelinePlaygroundField;
  onChange: (value: PipelinePlaygroundDraft) => void;
  onUpload: (files: File[]) => void;
  uploading: boolean;
}) {
  const fieldId = `playground-input-${field.name}`;
  const descriptionId = `${fieldId}-description`;
  const errorId = `${fieldId}-error`;
  const describedBy = [field.description ? descriptionId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`playground-field ${error ? 'playground-field-error' : ''}`}>
      <div className="playground-field-label">
        <label htmlFor={fieldId}>{field.label}</label>
        <span>{field.kind}{field.required ? ' · Required' : ' · Optional'}</span>
      </div>
      {field.description ? <p id={descriptionId}>{field.description}</p> : null}
      <InputControl
        describedBy={describedBy}
        draft={draft}
        field={field}
        fieldId={fieldId}
        onChange={onChange}
        onUpload={onUpload}
        uploading={uploading}
      />
      {error ? <span className="playground-field-error-text" id={errorId}>{error}</span> : null}
    </div>
  );
}

function InputControl({
  describedBy,
  draft,
  field,
  fieldId,
  onChange,
  onUpload,
  uploading,
}: {
  describedBy?: string;
  draft: PipelinePlaygroundDraft;
  field: PipelinePlaygroundField;
  fieldId: string;
  onChange: (value: PipelinePlaygroundDraft) => void;
  onUpload: (files: File[]) => void;
  uploading: boolean;
}) {
  if (field.kind === 'image' || field.kind === 'image_collection') {
    const artifacts = Array.isArray(draft) ? draft : isArtifactReference(draft) ? [draft] : [];
    return (
      <div className="playground-upload-control">
        {artifacts.length > 0 ? (
          <div className="playground-uploaded-images">
            {artifacts.map((artifact) => (
              <div className="playground-uploaded-image" key={artifact.assetId}>
                <Image
                  alt=""
                  height={artifact.height ?? 160}
                  src={`/api/assets/${encodeURIComponent(artifact.assetId)}/content`}
                  unoptimized
                  width={artifact.width ?? 240}
                />
                <span>{typeof artifact.originalName === 'string' ? artifact.originalName : 'Uploaded image'}</span>
              </div>
            ))}
          </div>
        ) : null}
        <label className="playground-upload-button" htmlFor={fieldId}>
          {uploading ? <LoaderCircle className="playground-spinner" size={16} /> : <Upload size={16} />}
          {uploading ? 'Uploading…' : artifacts.length > 0 ? 'Replace image' : 'Upload image'}
        </label>
        <input
          accept="image/*"
          aria-describedby={describedBy}
          disabled={uploading}
          id={fieldId}
          multiple={field.kind === 'image_collection'}
          onChange={(event) => onUpload(Array.from(event.target.files ?? []))}
          type="file"
        />
      </div>
    );
  }

  if (field.kind === 'boolean') {
    return (
      <select
        aria-describedby={describedBy}
        id={fieldId}
        onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value === 'true')}
        value={typeof draft === 'boolean' ? String(draft) : ''}
      >
        {!field.required ? <option value="">Not set</option> : null}
        <option value="true">True</option>
        <option value="false">False</option>
      </select>
    );
  }

  if (field.kind === 'number') {
    return (
      <input
        aria-describedby={describedBy}
        id={fieldId}
        inputMode="decimal"
        onChange={(event) => onChange(event.target.value)}
        placeholder="0"
        type="number"
        value={typeof draft === 'string' ? draft : ''}
      />
    );
  }

  if (field.kind === 'audio') {
    return <div className="playground-unsupported-input">Audio upload will be added with the audio asset contract.</div>;
  }

  const jsonLike = field.kind === 'json' || field.kind === 'publication';
  return (
    <textarea
      aria-describedby={describedBy}
      id={fieldId}
      onChange={(event) => onChange(event.target.value)}
      placeholder={jsonLike
        ? '{\n  "key": "value"\n}'
        : field.kind === 'text_collection'
          ? 'One value per line'
          : 'Enter text…'}
      rows={jsonLike ? 7 : 6}
      spellCheck={!jsonLike}
      value={typeof draft === 'string' ? draft : ''}
    />
  );
}

function PipelineResult({
  descriptor,
  error,
  run,
}: {
  descriptor: PipelinePlaygroundDescriptor | null;
  error: string | null;
  run: PipelinePlaygroundRun | null;
}) {
  return (
    <section className="playground-result-card" aria-labelledby="playground-result-title">
      <div className="playground-section-heading">
        <span className="playground-step">03</span>
        <div>
          <h2 id="playground-result-title">Result</h2>
          <p>The response appears here after the server worker completes the run.</p>
        </div>
      </div>
      {error ? (
        <p className="playground-message playground-message-error" role="alert">
          <CircleAlert size={15} />
          {error}
        </p>
      ) : null}
      {!run && !error ? (
        <div className="playground-result-placeholder">
          <FileImage size={28} />
          <span>No run yet</span>
        </div>
      ) : null}
      {run ? (
        <div className="playground-run-result">
          <div className="playground-run-meta">
            <StatusBadge status={run.status} />
            <code>{run.id}</code>
            <span>Attempt {run.attemptCount}/{run.maxAttempts}</span>
            {run.usage?.totalTokens ? <span>{run.usage.totalTokens} tokens</span> : null}
            {run.usage?.actualCostUsd ? <span>${run.usage.actualCostUsd}</span> : null}
          </div>
          {run.status === 'failed' && run.error ? (
            <p className="playground-message playground-message-error">
              <CircleAlert size={15} />
              {run.error.message}
            </p>
          ) : null}
          {run.status === 'queued' || run.status === 'running' ? (
            <div className="playground-result-loading">
              <LoaderCircle className="playground-spinner" size={22} />
              <span>{run.status === 'queued' ? 'Waiting for a worker…' : 'Pipeline is running…'}</span>
            </div>
          ) : null}
          {run.status === 'succeeded' && run.outputs && descriptor ? (
            <div className="playground-output-list">
              {descriptor.outputs.map((output) => (
                <PipelineOutputValue
                  key={output.name}
                  output={output}
                  value={run.outputs?.[output.name]}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function PipelineOutputValue({
  output,
  value,
}: {
  output: PipelinePlaygroundOutput;
  value: PipelineValue | undefined;
}) {
  return (
    <article className="playground-output">
      <div className="playground-output-title">
        <strong>{output.label}</strong>
        <span>{output.name} · {output.kind}</span>
      </div>
      <OutputContent label={output.label} value={value} />
    </article>
  );
}

function OutputContent({ label, value }: { label: string; value: PipelineValue | undefined }) {
  if (isArtifactReference(value)) {
    return (
      <div className="playground-output-image">
        <Image
          alt={label}
          height={value.height ?? 768}
          src={`/api/assets/${encodeURIComponent(value.assetId)}/content`}
          unoptimized
          width={value.width ?? 1024}
        />
        <a href={`/api/assets/${encodeURIComponent(value.assetId)}/content`} download>
          Download result
        </a>
      </div>
    );
  }
  if (Array.isArray(value) && value.every(isArtifactReference)) {
    return (
      <div className="playground-output-image-grid">
        {value.map((artifact, index) => (
          <OutputContent key={`${artifact.assetId}-${index}`} label={`${label} ${index + 1}`} value={artifact} />
        ))}
      </div>
    );
  }
  if (typeof value === 'string') return <pre>{value}</pre>;
  return <pre>{JSON.stringify(value ?? null, null, 2)}</pre>;
}

function StatusBadge({ status }: { status: PipelinePlaygroundRun['status'] }) {
  return (
    <span className={`playground-status playground-status-${status}`}>
      {status === 'queued' || status === 'running'
        ? <LoaderCircle className="playground-spinner" size={12} />
        : status === 'succeeded'
          ? <CheckCircle2 size={12} />
          : <CircleAlert size={12} />}
      {status}
    </span>
  );
}

function createInitialDrafts(fields: PipelinePlaygroundField[]) {
  return Object.fromEntries(fields.map((field) => [
    field.name,
    field.kind === 'boolean' && field.required ? false : undefined,
  ])) as Record<string, PipelinePlaygroundDraft>;
}

function isArtifactReference(value: unknown): value is PipelineArtifactReference {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as { kind?: unknown }).kind === 'image'
    && typeof (value as { assetId?: unknown }).assetId === 'string';
}

function wait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal.addEventListener('abort', () => {
      window.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}
