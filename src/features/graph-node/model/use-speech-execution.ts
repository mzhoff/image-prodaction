'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { saveUploadedAudioAsset } from '@/entities/production-graph/lib/remote-audio-asset';
import { getActiveAssetScope, getActiveAssetScopeSnapshot, subscribeActiveAssetScope } from '@/entities/production-graph/lib/remote-asset';
import type { TextToSpeechNodeData } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { MAX_SPEECH_TEXT_CHARACTERS } from '@/shared/media/speech-text';
import type { GenerateSpeechRequest } from '../api/ai-client-contracts';
import { isSpeechJobTerminal, requestCancelSpeechJob, requestSpeech, requestSpeechJob, type SpeechApiResult, type SpeechProgress } from '../api/speech-api';
import { appendSpeechResult } from './text-workflow-values';
import { trackBehavior } from '@/shared/analytics/client';

export function useSpeechExecution(nodeId: string, data: TextToSpeechNodeData) {
  const guard = useRef<AbortController | null>(null);
  const activeScope = useSyncExternalStore(subscribeActiveAssetScope, getActiveAssetScopeSnapshot, () => undefined);
  const [progress, setProgress] = useState<SpeechProgress>();
  useEffect(() => () => { guard.current?.abort(); guard.current = null; }, [nodeId, activeScope?.documentId, activeScope?.workspaceId]);

  const execute = useCallback(async (saved: NonNullable<TextToSpeechNodeData['speechRequest']>, payload?: GenerateSpeechRequest) => {
    const scope = getActiveAssetScope();
    if (!scope || guard.current) return;
    const controller = new AbortController(); guard.current = controller;
    const current = () => guard.current === controller && !controller.signal.aborted
      && getActiveAssetScope()?.workspaceId === scope.workspaceId && getActiveAssetScope()?.documentId === scope.documentId
      && useProductionGraphStore.getState().nodes.some((node) => node.id === nodeId);
    const store = useProductionGraphStore.getState();
    store.setNodeStatus(nodeId, 'running'); store.updateNodeDataSilent(nodeId, { speechRequest: saved, message: '' });
    try {
      const options = { scope, idempotencyKey: saved.idempotencyKey, signal: controller.signal,
        onJobAccepted: (jobId: string) => {
          if (!current() || saved.jobId === jobId) return;
          saved = { ...saved, jobId };
          useProductionGraphStore.getState().updateNodeDataSilent(nodeId, { speechRequest: saved });
        },
        onProgress: (value: SpeechProgress) => { if (current()) setProgress(value); },
      };
      const result: SpeechApiResult = saved.jobId ? await requestSpeechJob(saved.jobId, options)
        : await requestSpeech(payload!, options);
      if (!current()) return;
      const extension = 'blob' in result && result.mimeType.includes('wav') ? 'wav' : 'mp3';
      const asset = 'asset' in result ? result.asset : await saveUploadedAudioAsset(
        new File([result.blob], `voice-${Date.now()}.${extension}`, { type: result.mimeType }), scope, 'saved');
      if (!current()) return;
      const latest = useProductionGraphStore.getState();
      const nodeData = latest.nodes.find((node) => node.id === nodeId)!.data as TextToSpeechNodeData;
      latest.addAsset(asset);
      latest.updateNodeData(nodeId, { ...appendSpeechResult(nodeData, asset.id, {
        ...saved.metadata, createdAt: asset.createdAt, generationId: result.generationId,
        mimeType: asset.mimeType, sizeBytes: 'blob' in result ? result.blob.size : result.sizeBytes,
      }), speechRequest: undefined, message: '' });
      latest.setNodeStatus(nodeId, 'success'); setProgress(undefined);
    } catch (error) {
      if (!current()) return;
      useProductionGraphStore.getState().setNodeStatus(nodeId, 'error');
      useProductionGraphStore.getState().updateNodeDataSilent(nodeId, {
        message: error instanceof Error ? error.message : 'Voice could not complete. Retry checks the same request.',
      });
    } finally { if (guard.current === controller) guard.current = null; }
  }, [nodeId]);

  useEffect(() => {
    const saved = data.speechRequest;
    if (!activeScope || !saved?.jobId || guard.current) return;
    void execute(saved);
  }, [activeScope, data.speechRequest, execute]);

  const generate = async (payload: GenerateSpeechRequest) => {
    if (guard.current) return;
    const store = useProductionGraphStore.getState();
    if (!payload.inputText.trim() || payload.inputText.length > MAX_SPEECH_TEXT_CHARACTERS) {
      store.updateNodeDataSilent(nodeId, { message: `Connect text between 1 and ${MAX_SPEECH_TEXT_CHARACTERS.toLocaleString('en-US')} characters.` }); return;
    }
    const scope = getActiveAssetScope();
    if (!scope) { store.updateNodeDataSilent(nodeId, { message: 'Open a saved project before generating audio.' }); return; }
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
    const fingerprint = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (getActiveAssetScope()?.workspaceId !== scope.workspaceId || getActiveAssetScope()?.documentId !== scope.documentId) return;
    const latest = useProductionGraphStore.getState().nodes.find((node) => node.id === nodeId)?.data as TextToSpeechNodeData | undefined;
    if (!latest) return;
    if (latest.speechRequest && latest.speechRequest.fingerprint !== fingerprint) {
      store.updateNodeDataSilent(nodeId, { message: 'An earlier request is still attached. Check its result or cancel it before starting with changed text/settings.' }); return;
    }
    const saved = latest.speechRequest ?? {
      idempotencyKey: crypto.randomUUID(), fingerprint,
      metadata: { language: payload.language, model: payload.model, voice: payload.voice },
    };
    if (!saved.jobId && !guard.current) {
      trackBehavior('ip_generation_requested', { source: 'editor', node_type: 'textToSpeech', operation: 'generate_speech' });
    }
    await execute(saved, payload);
  };

  const cancel = async () => {
    const saved = data.speechRequest;
    if (!saved?.jobId) return;
    const isCurrent = captureRequestGuard(saved.idempotencyKey);
    try {
      await requestCancelSpeechJob(saved.jobId);
      if (!isCurrent()) return;
      useProductionGraphStore.getState().updateNodeDataSilent(nodeId, { message: 'Cancellation requested. The current paid part may finish; no new parts will start.' });
      if (!guard.current) void execute(saved);
    } catch (error) {
      if (!isCurrent()) return;
      useProductionGraphStore.getState().updateNodeDataSilent(nodeId, { message: error instanceof Error ? error.message : 'Cancellation failed. Check the same request again.' });
    }
  };

  const prepareNewRequest = async () => {
    const saved = data.speechRequest;
    if (!saved || guard.current) return;
    const isCurrent = captureRequestGuard(saved.idempotencyKey);
    try {
      const terminal = saved.jobId ? await isSpeechJobTerminal(saved.jobId) : true;
      if (!isCurrent() || guard.current) return;
      if (!terminal) {
        useProductionGraphStore.getState().updateNodeDataSilent(nodeId, { message: 'The previous request is still active. Check its result or cancel it first.' }); return;
      }
      if (!window.confirm('A new request can charge for all parts again, including parts of the previous request. Prepare a new request?')) return;
      useProductionGraphStore.getState().updateNodeDataSilent(nodeId, { speechRequest: undefined, message: '' });
      useProductionGraphStore.getState().setNodeStatus(nodeId, 'idle'); setProgress(undefined);
    } catch (error) {
      if (!isCurrent()) return;
      useProductionGraphStore.getState().updateNodeDataSilent(nodeId, { message: error instanceof Error ? error.message : 'Could not verify the previous request.' });
    }
  };

  function captureRequestGuard(idempotencyKey: string) {
    const scope = getActiveAssetScope();
    return () => Boolean(scope && getActiveAssetScope()?.workspaceId === scope.workspaceId
      && getActiveAssetScope()?.documentId === scope.documentId
      && (useProductionGraphStore.getState().nodes.find((node) => node.id === nodeId)?.data as TextToSpeechNodeData | undefined)?.speechRequest?.idempotencyKey === idempotencyKey);
  }

  return { generate, progress, cancel, prepareNewRequest, checkResult: () => data.speechRequest?.jobId && execute(data.speechRequest) };
}
