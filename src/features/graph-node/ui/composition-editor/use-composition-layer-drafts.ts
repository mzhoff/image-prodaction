'use client';

import { useEffect, useRef, useState } from 'react';
import type { CompositionLayerStyle } from '@/entities/production-graph/model/types';
import type { CompositionLayerPatch } from './composition-types';

export function useCompositionLayerDrafts(onCommit?: (patches: CompositionLayerPatch[]) => void) {
  const layerDraftFrameRef = useRef<number | undefined>(undefined);
  const pendingLayerDraftsRef = useRef<CompositionLayerPatch[]>([]);
  const [draftLayerPatches, setDraftLayerPatches] = useState<Record<string, Partial<CompositionLayerStyle>>>({});

  useEffect(() => () => {
    if (layerDraftFrameRef.current !== undefined) window.cancelAnimationFrame(layerDraftFrameRef.current);
  }, []);

  const scheduleLayerDrafts = (patches: CompositionLayerPatch[]) => {
    pendingLayerDraftsRef.current = patches;
    if (layerDraftFrameRef.current !== undefined) return;
    layerDraftFrameRef.current = window.requestAnimationFrame(() => {
      layerDraftFrameRef.current = undefined;
      const nextDrafts = pendingLayerDraftsRef.current;
      setDraftLayerPatches((current) => {
        const next = { ...current };
        nextDrafts.forEach(({ layerId, patch }) => {
          next[layerId] = { ...(next[layerId] ?? {}), ...patch };
        });
        return next;
      });
    });
  };

  const commitLayerDrafts = () => {
    const finalDrafts = pendingLayerDraftsRef.current;
    pendingLayerDraftsRef.current = [];
    if (layerDraftFrameRef.current !== undefined) {
      window.cancelAnimationFrame(layerDraftFrameRef.current);
      layerDraftFrameRef.current = undefined;
    }
    if (finalDrafts.length > 0) onCommit?.(finalDrafts);
    setDraftLayerPatches({});
  };

  return { commitLayerDrafts, draftLayerPatches, scheduleLayerDrafts };
}
