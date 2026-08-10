'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { BrandSelectOption } from '@/shared/ui/brand-select';
import {
  connectOpenRouter,
  disconnectOpenRouter,
  fetchOpenRouterUsage,
  fetchWorkspaceAiUsage,
  fetchWorkspaceProviders,
  fetchWorkspaceSettingsOptions,
  validateOpenRouter,
} from '../api/workspace-ai-api';
import type {
  OpenRouterKeyUsage,
  ProviderConnectionDto,
  WorkspaceAiUsage,
  WorkspaceSettingsOption,
} from '../api/workspace-ai-api';
import {
  isAbortError,
  isNotFoundError,
  readErrorMessage,
  roleLabel,
} from './provider-settings-values';

type ProviderMutation = 'connect' | 'disconnect' | 'validate' | null;

export function useProviderSettingsModel(onDirtyChange: (dirty: boolean) => void) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSettingsOption[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [workspacesPending, setWorkspacesPending] = useState(true);
  const [workspacesError, setWorkspacesError] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSettingsOption | null>(null);
  const [connection, setConnection] = useState<ProviderConnectionDto | null>(null);
  const [keyUsage, setKeyUsage] = useState<OpenRouterKeyUsage | null>(null);
  const [aiUsage, setAiUsage] = useState<WorkspaceAiUsage | null>(null);
  const [detailsPending, setDetailsPending] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [secondaryError, setSecondaryError] = useState<string | null>(null);
  const [mutation, setMutation] = useState<ProviderMutation>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [replaceFormOpen, setReplaceFormOpen] = useState(false);
  const [replaceConfirmationOpen, setReplaceConfirmationOpen] = useState(false);
  const [disconnectConfirmationOpen, setDisconnectConfirmationOpen] = useState(false);
  const dirty = apiKey.trim().length > 0;

  const loadWorkspaces = useCallback(async (signal?: AbortSignal) => {
    setWorkspacesPending(true);
    setWorkspacesError(null);
    try {
      const nextWorkspaces = await fetchWorkspaceSettingsOptions(signal);
      setWorkspaces(nextWorkspaces);
      setSelectedWorkspaceId((current) => (
        nextWorkspaces.some((item) => item.id === current) ? current : nextWorkspaces[0]?.id ?? ''
      ));
    } catch (error) {
      if (isAbortError(error)) return;
      setWorkspaces([]);
      setSelectedWorkspaceId('');
      setWorkspacesError(readErrorMessage(error));
    } finally {
      if (!signal?.aborted) setWorkspacesPending(false);
    }
  }, []);

  const loadWorkspaceDetails = useCallback(async (workspaceId: string, signal?: AbortSignal) => {
    setDetailsPending(true);
    setDetailsError(null);
    setSecondaryError(null);
    try {
      const [providersResult, keyUsageResult, aiUsageResult] = await Promise.allSettled([
        fetchWorkspaceProviders(workspaceId, signal),
        fetchOpenRouterUsage(workspaceId, signal),
        fetchWorkspaceAiUsage(workspaceId, 30, signal),
      ]);
      if (signal?.aborted) return;
      if (providersResult.status === 'rejected') throw providersResult.reason;

      const nextConnection = providersResult.value.providers.find(
        (item) => item.provider === 'openrouter',
      ) ?? null;
      setWorkspace(providersResult.value.workspace);
      setConnection(nextConnection);
      setKeyUsage(keyUsageResult.status === 'fulfilled' ? keyUsageResult.value : null);
      setAiUsage(aiUsageResult.status === 'fulfilled' ? aiUsageResult.value : null);

      const partialErrors: string[] = [];
      if (keyUsageResult.status === 'rejected' && nextConnection
        && nextConnection.status !== 'disconnected' && !isNotFoundError(keyUsageResult.reason)) {
        partialErrors.push('Не удалось обновить лимиты OpenRouter.');
      }
      if (aiUsageResult.status === 'rejected') {
        partialErrors.push('Не удалось загрузить локальную статистику Reverie.');
      }
      setSecondaryError(partialErrors.join(' '));
    } catch (error) {
      if (isAbortError(error)) return;
      setWorkspace(null);
      setConnection(null);
      setKeyUsage(null);
      setAiUsage(null);
      setDetailsError(readErrorMessage(error));
    } finally {
      if (!signal?.aborted) setDetailsPending(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadWorkspaces(controller.signal);
    return () => controller.abort();
  }, [loadWorkspaces]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setWorkspace(null);
      setConnection(null);
      setKeyUsage(null);
      setAiUsage(null);
      return;
    }
    const controller = new AbortController();
    void loadWorkspaceDetails(selectedWorkspaceId, controller.signal);
    return () => controller.abort();
  }, [loadWorkspaceDetails, selectedWorkspaceId]);

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  const workspaceOptions = useMemo<BrandSelectOption[]>(() => workspaces.map((item) => ({
    value: item.id,
    label: item.name,
    description: roleLabel(item.role),
  })), [workspaces]);
  const effectiveWorkspace = workspace
    ?? workspaces.find((item) => item.id === selectedWorkspaceId)
    ?? null;
  const canManage = connection?.canManage
    ?? Boolean(effectiveWorkspace && ['owner', 'admin'].includes(effectiveWorkspace.role));
  const disconnected = !connection || connection.status === 'disconnected';
  const showCredentialForm = canManage && (disconnected || replaceFormOpen);

  function resetCredentialDraft() {
    setApiKey('');
    setShowApiKey(false);
    setReplaceFormOpen(false);
    setReplaceConfirmationOpen(false);
    setDisconnectConfirmationOpen(false);
  }

  function selectWorkspace(nextWorkspaceId: string) {
    if (!nextWorkspaceId || nextWorkspaceId === selectedWorkspaceId) return;
    if (dirty && !window.confirm(
      'API key ещё не сохранён. Переключить Workspace и удалить введённое значение?',
    )) return;
    resetCredentialDraft();
    setActionError(null);
    setNotice(null);
    setSelectedWorkspaceId(nextWorkspaceId);
  }

  async function persistCredential(replacing: boolean) {
    if (!selectedWorkspaceId || mutation) return;
    const secret = apiKey.trim();
    if (!secret) return;
    setMutation('connect');
    setActionError(null);
    setNotice(null);
    try {
      const result = await connectOpenRouter(selectedWorkspaceId, secret);
      setConnection(result.provider);
      resetCredentialDraft();
      setNotice(replacing
        ? 'Новый OpenRouter key проверен и заменил предыдущее подключение.'
        : 'OpenRouter подключён для всего Workspace.');
      await loadWorkspaceDetails(selectedWorkspaceId);
    } catch (error) {
      const message = readErrorMessage(error);
      await loadWorkspaceDetails(selectedWorkspaceId);
      setActionError(message);
    } finally {
      setMutation(null);
    }
  }

  async function submitCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    setNotice(null);
    if (apiKey.trim().length < 12) {
      setActionError('Введите полный OpenRouter API key.');
      return;
    }
    if (!disconnected) {
      setReplaceConfirmationOpen(true);
      return;
    }
    await persistCredential(false);
  }

  async function validateConnection() {
    if (!selectedWorkspaceId || mutation) return;
    setMutation('validate');
    setActionError(null);
    setNotice(null);
    try {
      const result = await validateOpenRouter(selectedWorkspaceId);
      setConnection(result.provider);
      setKeyUsage(result.keyUsage);
      if (result.valid) setNotice('Подключение работает. Лимиты OpenRouter обновлены.');
      else setActionError(result.provider.lastError
        || 'OpenRouter отклонил сохранённый key. Замените его и повторите проверку.');
    } catch (error) {
      const message = readErrorMessage(error);
      await loadWorkspaceDetails(selectedWorkspaceId);
      setActionError(message);
    } finally {
      setMutation(null);
    }
  }

  async function confirmDisconnect() {
    if (!selectedWorkspaceId || mutation) return;
    setMutation('disconnect');
    setActionError(null);
    setNotice(null);
    try {
      await disconnectOpenRouter(selectedWorkspaceId);
      setConnection({ provider: 'openrouter', status: 'disconnected', canManage,
        maskedKey: null, lastValidatedAt: null, lastUsedAt: null, lastError: null });
      setKeyUsage(null);
      resetCredentialDraft();
      setNotice('OpenRouter отключён. Новые AI-операции этого Workspace запускаться не будут.');
      await loadWorkspaceDetails(selectedWorkspaceId);
    } catch (error) {
      setActionError(readErrorMessage(error));
    } finally {
      setMutation(null);
    }
  }

  return {
    actionError, aiUsage, apiKey, canManage, connection, detailsError, detailsPending,
    disconnectConfirmationOpen, disconnected, effectiveWorkspace, keyUsage, mutation, notice,
    replaceConfirmationOpen, secondaryError, selectedWorkspaceId, showApiKey,
    showCredentialForm, workspaceOptions, workspaces, workspacesError, workspacesPending,
    closeDisconnectConfirmation: () => setDisconnectConfirmationOpen(false),
    closeReplaceConfirmation: () => setReplaceConfirmationOpen(false),
    confirmDisconnect, loadWorkspaceDetails, loadWorkspaces, openDisconnectConfirmation: () =>
      setDisconnectConfirmationOpen(true),
    openReplaceForm: () => { setReplaceFormOpen(true); setActionError(null); setNotice(null); },
    persistCredential, resetCredentialDraft, selectWorkspace,
    submitCredential, toggleApiKeyVisibility: () => setShowApiKey((visible) => !visible),
    updateApiKey: (value: string) => {
      setApiKey(value); setActionError(null); setReplaceConfirmationOpen(false);
    },
    validateConnection,
  };
}

export type ProviderSettingsModel = ReturnType<typeof useProviderSettingsModel>;
