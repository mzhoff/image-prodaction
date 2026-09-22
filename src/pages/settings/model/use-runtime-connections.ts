'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RuntimeV2Client } from '@/modules/executable-pipelines/contracts/runtime-v2-contracts';
import type { RuntimeV2Pipeline } from '@/modules/executable-pipelines/contracts/runtime-v2-descriptor-contracts';
import { fetchWorkspaceSettingsOptions, type WorkspaceSettingsOption } from '../api/workspace-ai-api';
import {
  runtimeConnectionsApi, type RuntimeConnectionDetails, type IssuedRuntimeCredential,
} from '../api/runtime-connections-api';
import { runtimeErrorMessage } from './runtime-connections-values';

export function useRuntimeConnections(onDirtyChange: (dirty: boolean) => void) {
  const tUi = useTranslations();
  const [workspaces, setWorkspaces] = useState<WorkspaceSettingsOption[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [clients, setClients] = useState<RuntimeV2Client[]>([]);
  const [clientId, setClientId] = useState('');
  const [catalog, setCatalog] = useState<RuntimeV2Pipeline[]>([]);
  const [details, setDetails] = useState<RuntimeConnectionDetails | null>(null);
  const [workspacePending, setWorkspacePending] = useState(true);
  const [clientsPending, setClientsPending] = useState(false);
  const [detailsPending, setDetailsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mutation, setMutation] = useState(false);
  const [issuedCredential, setIssuedCredential] = useState<IssuedRuntimeCredential | null>(null);
  const mutationLock = useRef(false);
  const clientsRequest = useRef(0);
  const detailsRequest = useRef(0);
  const currentWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);
  const canManage = currentWorkspace?.role === 'owner' || currentWorkspace?.role === 'admin';

  const loadWorkspaces = useCallback(async (signal?: AbortSignal) => {
    setWorkspacePending(true);
    setError(null);
    try {
      const options = await fetchWorkspaceSettingsOptions(signal);
      if (signal?.aborted) return;
      setWorkspaces(options);
      setWorkspaceId((current) => options.some((item) => item.id === current) ? current : options[0]?.id ?? '');
    } catch (reason) {
      if (!signal?.aborted) setError(runtimeErrorMessage(reason));
    } finally {
      if (!signal?.aborted) setWorkspacePending(false);
    }
  }, []);

  const loadClients = useCallback(async (id: string, signal?: AbortSignal) => {
    const request = ++clientsRequest.current;
    setClientsPending(true);
    try {
      const [connections, pipelines] = await Promise.all([
        runtimeConnectionsApi.listClients(id, signal), runtimeConnectionsApi.listPipelines(id, signal),
      ]);
      if (signal?.aborted || request !== clientsRequest.current) return;
      setClients(connections.clients);
      setCatalog(pipelines.pipelines);
      setClientId((current) => connections.clients.some((item) => item.id === current)
        ? current : connections.clients[0]?.id ?? '');
    } catch (reason) {
      if (!signal?.aborted && request === clientsRequest.current) setError(runtimeErrorMessage(reason));
    } finally {
      if (!signal?.aborted && request === clientsRequest.current) setClientsPending(false);
    }
  }, []);

  const loadDetails = useCallback(async (workspace: string, client: string, signal?: AbortSignal) => {
    const request = ++detailsRequest.current;
    setDetailsPending(true);
    try {
      const response = await runtimeConnectionsApi.getClient(workspace, client, signal);
      if (!signal?.aborted && request === detailsRequest.current) setDetails(response);
    } catch (reason) {
      if (!signal?.aborted && request === detailsRequest.current) setError(runtimeErrorMessage(reason));
    } finally {
      if (!signal?.aborted && request === detailsRequest.current) setDetailsPending(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadWorkspaces(controller.signal);
    return () => controller.abort();
  }, [loadWorkspaces]);

  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    void loadClients(workspaceId, controller.signal);
    return () => controller.abort();
  }, [workspaceId, loadClients]);

  useEffect(() => {
    if (!workspaceId || !clientId) return;
    const controller = new AbortController();
    void loadDetails(workspaceId, clientId, controller.signal);
    return () => controller.abort();
  }, [workspaceId, clientId, loadDetails]);

  useEffect(() => {
    onDirtyChange(issuedCredential !== null);
    return () => onDirtyChange(false);
  }, [issuedCredential, onDirtyChange]);

  async function refresh() {
    if (!workspaceId) return;
    setError(null);
    await Promise.all([
      loadClients(workspaceId),
      clientId ? loadDetails(workspaceId, clientId) : Promise.resolve(),
    ]);
  }

  async function mutate<T>(action: () => Promise<T>, success: string): Promise<T | undefined> {
    if (mutationLock.current || !canManage) return;
    mutationLock.current = true;
    setMutation(true);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      setNotice(success);
      return result;
    } catch (reason) {
      setError(runtimeErrorMessage(reason));
      return undefined;
    } finally {
      mutationLock.current = false;
      setMutation(false);
    }
  }

  function selectWorkspace(id: string) {
    if (mutationLock.current || id === workspaceId) return;
    if (issuedCredential && !window.confirm(tUi("Ключ показан только один раз. Вы уже перенесли его в подключаемое приложение?"))) return;
    clientsRequest.current += 1;
    detailsRequest.current += 1;
    setIssuedCredential(null);
    setClients([]);
    setCatalog([]);
    setDetails(null);
    setClientId('');
    setNotice(null);
    setError(null);
    setWorkspaceId(id);
  }

  function selectClient(id: string) {
    if (mutationLock.current || id === clientId) return;
    if (issuedCredential && !window.confirm(tUi("Ключ показан только один раз. Вы уже перенесли его в подключаемое приложение?"))) return;
    detailsRequest.current += 1;
    setIssuedCredential(null);
    setDetails(null);
    setNotice(null);
    setError(null);
    setClientId(id);
  }

  return {
    workspaces, workspaceId, clients, clientId, catalog, details, canManage,
    workspacePending, clientsPending, detailsPending, error, notice, mutation,
    issuedCredential, setIssuedCredential, setClientId, loadWorkspaces,
    selectWorkspace, selectClient, refresh, mutate,
  };
}

export type RuntimeConnectionsModel = ReturnType<typeof useRuntimeConnections>;
