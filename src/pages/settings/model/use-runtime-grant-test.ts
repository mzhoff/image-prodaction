'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffect, useRef, useState } from 'react';
import type { RuntimeV2Grant } from '@/modules/executable-pipelines/contracts/runtime-v2-descriptor-contracts';
import type { RuntimeV2Run } from '@/modules/executable-pipelines/contracts/runtime-v2-run-contracts';
import { runtimeConnectionsApi, RuntimeConnectionsApiError } from '../api/runtime-connections-api';
import {
  createRuntimeTestAttempt, initialRuntimeTestInput, runtimeRunIsTerminal, type RuntimeTestAttempt,
} from './runtime-grant-test-values';
import { runtimeErrorMessage } from './runtime-connections-values';

export function useRuntimeGrantTest(workspaceId: string, clientId: string, grant: RuntimeV2Grant) {
  const tUi = useTranslations();
  const [input, setInput] = useState(() => initialRuntimeTestInput(grant));
  const [cap, setCap] = useState('');
  const [attempt, setAttempt] = useState<RuntimeTestAttempt | null>(null);
  const [run, setRun] = useState<RuntimeV2Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);
  const lock = useRef(false);
  const terminal = run !== null && runtimeRunIsTerminal(run.status);

  useEffect(() => {
    if (!run || runtimeRunIsTerminal(run.status)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void runtimeConnectionsApi.getRun(workspaceId, clientId, run.id, controller.signal).then((result) => {
        if (!controller.signal.aborted) { setRun(result.run); setError(null); }
      }).catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(runtimeErrorMessage(reason));
      });
    }, 2_000);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [workspaceId, clientId, run]);

  async function submit() {
    if (lock.current || terminal) return;
    let current: RuntimeTestAttempt;
    try { current = attempt ?? createRuntimeTestAttempt(grant, input, cap, crypto.randomUUID()); }
    catch (reason) { setError(runtimeErrorMessage(reason)); return; }
    if (!attempt && !window.confirm(tUi("Запустить один тест выбранной версии? Если pipeline использует AI-провайдера, этот вызов может быть платным."))) return;
    lock.current = true;
    setBusy(true);
    setAttempt(current);
    setError(null);
    try {
      const result = await runtimeConnectionsApi.createRun(workspaceId, clientId, grant.id, current.request, current.key);
      setRun(result.run);
    } catch (reason) {
      setError(runtimeErrorMessage(reason));
      setRejected(reason instanceof RuntimeConnectionsApiError && [400, 401, 403, 404, 409, 422].includes(reason.status));
    } finally { lock.current = false; setBusy(false); }
  }

  async function read() {
    if (!run || lock.current) return;
    lock.current = true;
    setBusy(true);
    try { setRun((await runtimeConnectionsApi.getRun(workspaceId, clientId, run.id)).run); setError(null); }
    catch (reason) { setError(runtimeErrorMessage(reason)); }
    finally { lock.current = false; setBusy(false); }
  }

  async function cancel() {
    if (!run || lock.current || terminal) return;
    if (!window.confirm(tUi("Отменить этот запуск? Уже выполненные вызовы провайдера могут быть оплачены."))) return;
    lock.current = true;
    setBusy(true);
    try { setRun((await runtimeConnectionsApi.cancelRun(workspaceId, clientId, run.id)).run); setError(null); }
    catch (reason) { setError(runtimeErrorMessage(reason)); }
    finally { lock.current = false; setBusy(false); }
  }

  function reset() {
    if (!terminal && !rejected) return;
    setAttempt(null); setRun(null); setRejected(false); setError(null);
  }
  return { input, setInput, cap, setCap, attempt, run, busy, error, rejected, terminal, submit, read, cancel, reset };
}
