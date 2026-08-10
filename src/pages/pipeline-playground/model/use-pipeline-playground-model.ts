'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PipelinePlaygroundDescriptor, PipelinePlaygroundField,
  PipelinePlaygroundRun } from '@/modules/executable-pipelines/contracts/pipeline-playground-contracts';
import { createPipelinePlaygroundRun, fetchPipelinePlaygroundDescriptor,
  fetchPipelinePlaygroundRun, uploadPipelinePlaygroundImage,
} from '@/modules/executable-pipelines/adapters/client/pipeline-playground-api';
import { createId } from '@/shared/lib/id';
import { buildPipelinePlaygroundInput } from './pipeline-playground-inputs';
import type { PipelinePlaygroundDraft } from './pipeline-playground-inputs';
import { createInitialDrafts, TERMINAL_PIPELINE_STATUSES, wait } from './pipeline-playground-values';

export function usePipelinePlaygroundModel(
  initialEndpoint: string,
  updateEndpointUrl: (endpoint: string) => void,
) {
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
    descriptor?.inputs ?? [], drafts, uploadingFields,
  ), [descriptor?.inputs, drafts, uploadingFields]);
  const runActive = Boolean(run && !TERMINAL_PIPELINE_STATUSES.has(run.status));
  const executeDisabled = !descriptor || !inputBuild.ready || connectionPending
    || executionPending || runActive;

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
      if (options.updateUrl !== false) updateEndpointUrl(normalized);
    } catch (error) {
      if (options.signal?.aborted) return;
      setDescriptor(null);
      setDrafts({});
      setConnectionError(error instanceof Error ? error.message : 'Pipeline could not be connected.');
    } finally {
      if (!options.signal?.aborted) setConnectionPending(false);
    }
  }, [updateEndpointUrl]);

  useEffect(() => {
    const normalized = initialEndpoint.trim();
    if (!normalized || initialConnectionRef.current === normalized) return undefined;
    initialConnectionRef.current = normalized;
    const controller = new AbortController();
    void connectPipeline(normalized, { signal: controller.signal, updateUrl: false });
    return () => controller.abort();
  }, [connectPipeline, initialEndpoint]);

  const activeRunId = run?.id;
  const activeRunStatus = run?.status;
  useEffect(() => {
    if (!activeRunId || !activeRunStatus
      || TERMINAL_PIPELINE_STATUSES.has(activeRunStatus)) return undefined;
    const controller = new AbortController();
    let active = true;
    const poll = async () => {
      while (active && !controller.signal.aborted) {
        await wait(900, controller.signal).catch(() => undefined);
        if (!active || controller.signal.aborted) return;
        try {
          const current = await fetchPipelinePlaygroundRun(activeRunId, controller.signal);
          setRun(current);
          if (TERMINAL_PIPELINE_STATUSES.has(current.status)) return;
        } catch (error) {
          if (controller.signal.aborted) return;
          setExecutionError(error instanceof Error ? error.message : 'Pipeline result could not be loaded.');
          return;
        }
      }
    };
    void poll();
    return () => { active = false; controller.abort(); };
  }, [activeRunId, activeRunStatus]);

  function changeEndpoint(value: string) {
    setEndpoint(value);
    setDescriptor(null);
    setDrafts({});
    setRun(null);
    setConnectionError(null);
    setExecutionError(null);
  }

  function changeDraft(name: string, value: PipelinePlaygroundDraft) {
    setDrafts((current) => ({ ...current, [name]: value }));
    setUploadErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
    setRun(null);
    setExecutionError(null);
  }

  async function uploadFiles(field: PipelinePlaygroundField, files: File[]) {
    if (!descriptor || files.length === 0) return;
    setUploadingFields((current) => new Set(current).add(field.name));
    setUploadErrors((current) => {
      const next = { ...current }; delete next[field.name]; return next;
    });
    try {
      const uploaded = await Promise.all(files.map((file) =>
        uploadPipelinePlaygroundImage(file, descriptor.workspaceId)));
      changeDraft(field.name, field.kind === 'image_collection' ? uploaded : uploaded[0]);
    } catch (error) {
      setUploadErrors((current) => ({ ...current,
        [field.name]: error instanceof Error ? error.message : 'Image could not be uploaded.' }));
    } finally {
      setUploadingFields((current) => {
        const next = new Set(current); next.delete(field.name); return next;
      });
    }
  }

  async function executePipeline() {
    if (!descriptor || executeDisabled) return;
    setExecutionPending(true);
    setExecutionError(null);
    setRun(null);
    try {
      setRun(await createPipelinePlaygroundRun({
        idempotencyKey: createId('playground'), input: inputBuild.input,
        publicId: descriptor.publicId,
      }));
    } catch (error) {
      setExecutionError(error instanceof Error ? error.message : 'Pipeline run could not be started.');
    } finally {
      setExecutionPending(false);
    }
  }

  return {
    changeDraft, changeEndpoint, connectPipeline, connectionError, connectionPending,
    descriptor, drafts, endpoint, executeDisabled, executePipeline, executionError,
    executionPending, inputBuild, run, runActive, uploadErrors, uploadFiles, uploadingFields,
  };
}

export type PipelinePlaygroundModel = ReturnType<typeof usePipelinePlaygroundModel>;
