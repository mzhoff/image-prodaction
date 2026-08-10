'use client';

import { CircleAlert, LoaderCircle, Play, PlugZap, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { usePipelinePlaygroundModel } from '../model/use-pipeline-playground-model';
import { PipelineInputField, PipelineSummary } from './pipeline-playground-inputs';
import { PipelineResult } from './pipeline-playground-result';

interface PipelinePlaygroundPageProps {
  initialEndpoint?: string;
}

export function PipelinePlaygroundPage({ initialEndpoint = '' }: PipelinePlaygroundPageProps) {
  const router = useRouter();
  const updateEndpointUrl = useCallback((endpoint: string) => {
    router.replace(`/playground?endpoint=${encodeURIComponent(endpoint)}`, { scroll: false });
  }, [router]);
  const model = usePipelinePlaygroundModel(initialEndpoint, updateEndpointUrl);
  return (
    <>
      <header className="workspace-header playground-header">
        <div><h1>Playground</h1>
          <p>Connect an executable pipeline, fill its inputs and inspect the server result.</p></div>
      </header>
      <div className="workspace-content playground-content">
        <PipelineConnection model={model} />
        <PipelineInputs model={model} />
        <PipelineResult descriptor={model.descriptor} error={model.executionError} run={model.run} />
      </div>
    </>
  );
}

type Model = ReturnType<typeof usePipelinePlaygroundModel>;

function PipelineConnection({ model }: { model: Model }) {
  return (
    <section className="playground-connect-card" aria-labelledby="playground-connect-title">
      <div className="playground-section-heading">
        <span className="playground-step">01</span>
        <div><h2 id="playground-connect-title">Pipeline endpoint</h2>
          <p>Paste a runtime URL from the Pipelines section.</p></div>
      </div>
      <form className="playground-endpoint-form" onSubmit={(event) => {
        event.preventDefault(); void model.connectPipeline(model.endpoint);
      }}>
        <label>
          <span>Endpoint URL</span>
          <input aria-describedby={model.connectionError ? 'playground-connection-error' : undefined}
            onChange={(event) => model.changeEndpoint(event.target.value)}
            placeholder="http://localhost:3004/v1/pipelines/pln_…/runs" spellCheck={false}
            inputMode="url" type="text" value={model.endpoint} />
        </label>
        <button disabled={model.connectionPending || !model.endpoint.trim()} type="submit">
          {model.connectionPending
            ? <LoaderCircle className="playground-spinner" size={16} /> : <PlugZap size={16} />}
          {model.connectionPending ? 'Connecting…' : 'Connect'}
        </button>
      </form>
      {model.connectionError ? (
        <p className="playground-message playground-message-error"
          id="playground-connection-error" role="alert">
          <CircleAlert size={15} />{model.connectionError}
        </p>
      ) : null}
      {model.descriptor ? <PipelineSummary descriptor={model.descriptor} /> : null}
    </section>
  );
}

function PipelineInputs({ model }: { model: Model }) {
  return (
    <section className="playground-input-card" aria-labelledby="playground-input-title">
      <div className="playground-section-heading">
        <span className="playground-step">02</span>
        <div><h2 id="playground-input-title">Input</h2>
          <p>Required fields must be filled before execution.</p></div>
      </div>
      {!model.descriptor ? (
        <div className="playground-placeholder">Connect a pipeline to load its input schema.</div>
      ) : model.descriptor.inputs.length === 0 ? (
        <div className="playground-placeholder">This pipeline has no external inputs.</div>
      ) : (
        <div className="playground-fields">{model.descriptor.inputs.map((field) => (
          <PipelineInputField draft={model.drafts[field.name]}
            error={model.uploadErrors[field.name] ?? model.inputBuild.errors[field.name]}
            field={field} key={field.name}
            onChange={(value) => model.changeDraft(field.name, value)}
            onUpload={(files) => void model.uploadFiles(field, files)}
            uploading={model.uploadingFields.has(field.name)} />
        ))}</div>
      )}
      <div className="playground-execute-row">
        <span>{model.descriptor && !model.inputBuild.ready
          ? 'Complete all required inputs to continue.'
          : 'Each click creates a new durable pipeline run.'}</span>
        <button className="playground-execute-button" disabled={model.executeDisabled}
          onClick={() => void model.executePipeline()} type="button">
          {model.executionPending || model.runActive
            ? <LoaderCircle className="playground-spinner" size={17} />
            : model.run?.status === 'succeeded'
              ? <RotateCcw size={17} /> : <Play fill="currentColor" size={17} />}
          {model.executionPending ? 'Starting…' : model.runActive ? 'Running…'
            : model.run?.status === 'succeeded' ? 'Run again' : 'Run pipeline'}
        </button>
      </div>
    </section>
  );
}
