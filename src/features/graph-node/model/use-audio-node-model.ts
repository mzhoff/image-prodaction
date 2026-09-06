'use client';

import { useEffect, useRef } from 'react';
import { getAudioConvertResultSignature, getFirstIncomingAudioAsset, getNodeAudioAssetId } from '@/entities/production-graph/model/graph-audio-io';
import { getActiveAssetScope } from '@/entities/production-graph/lib/remote-asset';
import type { AudioConvertNodeData, ProductionNode, SpeechToTextNodeData } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { requestConvertAudio, requestTranscribeAudio } from '../api/audio-api';

export function useAudioNodeModel(node: ProductionNode) {
  const nodes = useProductionGraphStore((state) => state.nodes);
  const edges = useProductionGraphStore((state) => state.edges);
  const assets = useProductionGraphStore((state) => state.assets);
  const update = useProductionGraphStore((state) => state.updateNodeData);
  const silent = useProductionGraphStore((state) => state.updateNodeDataSilent);
  const setStatus = useProductionGraphStore((state) => state.setNodeStatus);
  const addAsset = useProductionGraphStore((state) => state.addAsset);
  const pending = useRef<AbortController | null>(null);
  const scope = getActiveAssetScope();
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, [node.id, scope?.documentId, scope?.workspaceId]);
  const source = getFirstIncomingAudioAsset(node.id, node.type === 'audioConvert' ? 'source' : 'audio', { nodes, edges, assets });
  const resultAssetId = getNodeAudioAssetId(node, { nodes, edges });
  const run = async () => {
    if (pending.current) return;
    if (!source || source.storage.type !== 'remote') {
      silent(node.id, { message: 'Connect managed audio from Import, Voice or Audio Convert first.' }); return;
    }
    const controller = new AbortController(); pending.current = controller;
    setStatus(node.id, 'running'); silent(node.id, { message: '' });
    try {
      if (node.type === 'speechToText') {
        const data = node.data as SpeechToTextNodeData;
        const fingerprint = JSON.stringify([scope?.workspaceId, scope?.documentId, source.id, data.model, data.language || 'auto']);
        const idempotencyKey = data.lastRequest?.fingerprint === fingerprint ? data.lastRequest.idempotencyKey : crypto.randomUUID();
        silent(node.id, { lastRequest: { fingerprint, idempotencyKey } });
        const result = await requestTranscribeAudio({ audioAssetId: source.id, model: data.model,
          language: data.language || undefined, idempotencyKey }, controller.signal);
        controller.signal.throwIfAborted();
        update(node.id, { result: result.text, audioAssetId: source.id, lastRequest: undefined });
      } else {
        const data = node.data as AudioConvertNodeData;
        const asset = await requestConvertAudio({ audioAssetId: source.id, format: data.format,
          bitrateKbps: data.bitrateKbps, sampleRateHz: data.sampleRateHz, channels: data.channels }, controller.signal);
        controller.signal.throwIfAborted(); addAsset(asset);
        update(node.id, { audioAssetId: asset.id, sourceAudioAssetId: source.id, audioResultSignature: getAudioConvertResultSignature(source.id, data) });
      }
      setStatus(node.id, 'success');
    } catch (cause) {
      if (!controller.signal.aborted) {
        setStatus(node.id, 'error'); silent(node.id, { message: cause instanceof Error ? cause.message : 'Audio processing failed.' });
      }
    } finally { if (pending.current === controller) pending.current = null; }
  };
  return { source, resultAssetId, run, update: (data: Partial<SpeechToTextNodeData & AudioConvertNodeData>) => {
    if (node.status === 'running') return;
    update(node.id, node.type === 'audioConvert' ? { ...data, audioAssetId: undefined } : data);
  } };
}
