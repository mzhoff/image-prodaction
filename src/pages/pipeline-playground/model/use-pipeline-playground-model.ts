'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffectEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PipelinePlaygroundDescriptor, PipelinePlaygroundField, PipelinePlaygroundRun } from '@/modules/executable-pipelines/contracts/pipeline-playground-contracts';
import { createPipelinePlaygroundRun, fetchPipelinePlaygroundDescriptor, fetchPipelinePlaygroundRun,
  uploadPipelinePlaygroundMedia } from '@/modules/executable-pipelines/adapters/client/pipeline-playground-api';
import { createId } from '@/shared/lib/id';
import { buildPipelinePlaygroundInput, type PipelinePlaygroundDraft } from './pipeline-playground-inputs';
import { createInitialDrafts, isArtifactReference, TERMINAL_PIPELINE_STATUSES, wait } from './pipeline-playground-values';
import { playgroundMediaKind, validatePlaygroundFiles } from './pipeline-playground-media';

export function usePipelinePlaygroundModel(initialEndpoint: string, updateEndpointUrl: (endpoint: string) => void, workspaceId?: string) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const [endpoint, setEndpoint] = useState(initialEndpoint);
  const [descriptor, setDescriptor] = useState<PipelinePlaygroundDescriptor | null>(null);
  const [drafts, setDrafts] = useState<Record<string, PipelinePlaygroundDraft>>({});
  const [uploadingNames, setUploadingNames] = useState<Record<string, string[]>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [connectionPending, setConnectionPending] = useState(false);
  const [executionPending, setExecutionPending] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [run, setRun] = useState<PipelinePlaygroundRun | null>(null);
  const [pollRevision, setPollRevision] = useState(0);
  const loadedEndpointRef = useRef('');
  const epochRef = useRef(0);
  const connectionRef = useRef<AbortController | null>(null);
  const uploadsRef = useRef(new Map<string, AbortController>());
  const executionRef = useRef<AbortController | null>(null);
  const executionLockRef = useRef(false);
  const submissionRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const uploadingFields = useMemo(() => new Set(Object.keys(uploadingNames)), [uploadingNames]);
  const inputBuild = useMemo(() => buildPipelinePlaygroundInput(descriptor?.inputs ?? [], drafts, uploadingFields), [descriptor?.inputs, drafts, uploadingFields]);
  const runActive = Boolean(run && !TERMINAL_PIPELINE_STATUSES.has(run.status));
  const busy = executionPending || runActive;
  const executeDisabled = !descriptor || !inputBuild.ready || connectionPending || busy;

  const clearConnection = useCallback(() => {
    epochRef.current++;
    connectionRef.current?.abort();
    for (const controller of uploadsRef.current.values()) controller.abort();
    uploadsRef.current.clear();
    loadedEndpointRef.current = '';
    submissionRef.current = null;
    setDescriptor(null); setDrafts({}); setRun(null); setUploadingNames({}); setUploadErrors({});
    setConnectionError(null); setExecutionError(null);
  }, []);

  const connectPipeline = useCallback(async (value: string, options: { signal?: AbortSignal; updateUrl?: boolean } = {}) => {
    if (executionLockRef.current) return;
    const normalized = value.trim();
    if (!normalized) { setConnectionError(tUi("Выберите pipeline или вставьте ссылку.")); return; }
    clearConnection();
    const epoch = epochRef.current;
    const controller = new AbortController();
    connectionRef.current = controller;
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    setEndpoint(normalized); setConnectionPending(true);
    try {
      const connected = await fetchPipelinePlaygroundDescriptor(normalized, controller.signal);
      if (controller.signal.aborted || epoch !== epochRef.current) return;
      if (workspaceId && connected.workspaceId !== workspaceId) throw new Error(tUi("Этот pipeline находится в другом рабочем пространстве. Переключите пространство или выберите другой pipeline."));
      loadedEndpointRef.current = normalized;
      setDescriptor(connected); setDrafts(createInitialDrafts(connected.inputs));
      if (options.updateUrl !== false) updateEndpointUrl(normalized);
    } catch (error) {
      if (!controller.signal.aborted && epoch === epochRef.current) setConnectionError(error instanceof Error ? error.message : tUi("Не удалось подключить pipeline."));
    } finally {
      options.signal?.removeEventListener('abort', abort);
      if (!controller.signal.aborted && epoch === epochRef.current) setConnectionPending(false);
    }
  }, [tUi, clearConnection, updateEndpointUrl, workspaceId]);

  useEffect(() => {
    const normalized = initialEndpoint.trim();
    if (!normalized || loadedEndpointRef.current === normalized) return;
    const controller = new AbortController();
    void connectPipeline(normalized, { signal: controller.signal, updateUrl: false });
    return () => controller.abort();
  }, [connectPipeline, initialEndpoint]);

  useEffect(() => {
    const uploads = uploadsRef.current;
    return () => {
      connectionRef.current?.abort(); executionRef.current?.abort();
      for (const controller of uploads.values()) controller.abort();
      uploads.clear();
    };
  }, []);

  const activeRunId = run?.id;
  const activeRunStatus = run?.status;
  useEffect(() => {
    if (!activeRunId || !activeRunStatus || TERMINAL_PIPELINE_STATUSES.has(activeRunStatus)) return;
    const controller = new AbortController();
    const poll = async () => {
      while (!controller.signal.aborted) {
        await wait(900, controller.signal).catch(() => undefined);
        if (controller.signal.aborted) return;
        try {
          const current = await fetchPipelinePlaygroundRun(activeRunId, controller.signal);
          if (controller.signal.aborted) return;
          setRun(current); setExecutionError(null);
          if (TERMINAL_PIPELINE_STATUSES.has(current.status)) { executionLockRef.current = false; return; }
        } catch (error) {
          if (!controller.signal.aborted) setExecutionError(error instanceof Error ? error.message : tEffect("Не удалось обновить результат."));
          return;
        }
      }
    };
    void poll();
    return () => controller.abort();
  }, [activeRunId, activeRunStatus, pollRevision]);

  function changeEndpoint(value: string) {
    if (executionLockRef.current) return;
    clearConnection(); setConnectionPending(false); setEndpoint(value);
  }
  function changeDraft(name: string, value: PipelinePlaygroundDraft) {
    if (executionLockRef.current) return;
    setDrafts((current) => ({ ...current, [name]: value }));
    setUploadErrors((current) => { const next = { ...current }; delete next[name]; return next; });
    setRun(null); setExecutionError(null);
  }

  async function uploadFiles(field: PipelinePlaygroundField, files: File[]) {
    const kind = playgroundMediaKind(field.kind);
    if (!descriptor || !kind || !files.length || uploadsRef.current.has(field.name) || executionLockRef.current) return;
    const error = validatePlaygroundFiles(field.kind, files);
    if (error) { setUploadErrors((current) => ({ ...current, [field.name]: error })); return; }
    const controller = new AbortController(), epoch = epochRef.current;
    const draft = drafts[field.name];
    const existing = Array.isArray(draft) ? draft.filter(isArtifactReference) : [];
    uploadsRef.current.set(field.name, controller);
    setUploadingNames((current) => ({ ...current, [field.name]: files.map((file) => file.name) }));
    setUploadErrors((current) => { const next = { ...current }; delete next[field.name]; return next; });
    try {
      const uploaded = [];
      // Bounded transfers also let each completed item become usable immediately.
      for (const file of files) {
        uploaded.push(await uploadPipelinePlaygroundMedia(file, descriptor.workspaceId, kind, controller.signal));
        if (controller.signal.aborted || epoch !== epochRef.current) return;
        const completed = [...uploaded];
        setDrafts((current) => ({ ...current, [field.name]: field.kind === 'image_collection'
          ? [...existing, ...completed]
          : completed[0] }));
        setUploadingNames((current) => ({ ...current, [field.name]: files.slice(completed.length).map((item) => item.name) }));
      }
      setRun(null); setExecutionError(null);
    } catch (error) {
      if (!controller.signal.aborted && epoch === epochRef.current) setUploadErrors((current) => ({ ...current,
        [field.name]: error instanceof Error ? error.message : tUi("Не удалось подготовить файл.") }));
    } finally {
      if (epoch === epochRef.current) {
        uploadsRef.current.delete(field.name);
        setUploadingNames((current) => { const next = { ...current }; delete next[field.name]; return next; });
      }
    }
  }

  async function executePipeline() {
    if (!descriptor || executeDisabled || executionLockRef.current || uploadsRef.current.size) return;
    executionLockRef.current = true;
    const controller = new AbortController(); executionRef.current = controller;
    setExecutionPending(true); setExecutionError(null); setRun(null);
    try {
      // Retrying an uncertain response must recover the same paid operation.
      const fingerprint = JSON.stringify([descriptor.publicId, descriptor.version, inputBuild.input]);
      if (submissionRef.current?.fingerprint !== fingerprint) submissionRef.current = { fingerprint, key: createId('playground') };
      const created = await createPipelinePlaygroundRun({ idempotencyKey: submissionRef.current.key, input: inputBuild.input, publicId: descriptor.publicId }, controller.signal);
      if (controller.signal.aborted) return;
      submissionRef.current = null;
      setRun(created);
      if (TERMINAL_PIPELINE_STATUSES.has(created.status)) executionLockRef.current = false;
    } catch (error) {
      if (!controller.signal.aborted) {
        executionLockRef.current = false;
        setExecutionError(error instanceof Error ? error.message : tUi("Не удалось запустить pipeline."));
      }
    } finally { if (!controller.signal.aborted) setExecutionPending(false); }
  }

  return { changeDraft, changeEndpoint, connectPipeline, connectionError, connectionPending,
    descriptor, drafts, endpoint, executeDisabled, executePipeline, executionError, executionPending,
    inputBuild, run, runActive, busy, uploadErrors, uploadFiles, uploadingFields, uploadingNames,
    refreshRun: () => setPollRevision((value) => value + 1) };
}
export type PipelinePlaygroundModel = ReturnType<typeof usePipelinePlaygroundModel>;
