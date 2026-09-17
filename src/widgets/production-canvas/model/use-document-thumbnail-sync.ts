'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { uploadDocumentThumbnail } from '@/entities/document/api/document-api';
import { DOCUMENT_PREVIEW_UPDATED } from '@/entities/document/api/document-exit-tasks';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { collectCanvasOverview, renderCanvasOverview } from '../lib/canvas-overview';
import { captureCanvasSnapshot } from '../lib/canvas-snapshot';

type ThumbnailMode = 'auto' | 'manual';
interface UseDocumentThumbnailSyncOptions {
  canvasRef: RefObject<HTMLDivElement | null>;
  projectId?: string;
  prepareExit: () => Promise<number>;
  serverMode: ThumbnailMode;
  workspaceId?: string;
}

export function useDocumentThumbnailSync({
  canvasRef, projectId, prepareExit, serverMode, workspaceId,
}: UseDocumentThumbnailSyncOptions) {
  const [mode, setMode] = useState<ThumbnailMode>(serverMode);
  const [manualCapturePending, setManualCapturePending] = useState(false);
  const mountedRef = useRef(true);
  const manualIntentRef = useRef(serverMode === 'manual');
  const exitStartedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    exitStartedRef.current = false;
    return () => { mountedRef.current = false; };
  }, [projectId]);
  useEffect(() => {
    manualIntentRef.current = serverMode === 'manual';
    setMode(serverMode);
  }, [projectId, serverMode]);

  const createManualSnapshot = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!projectId || !workspaceId || !canvas) throw new Error('Document storage is not ready yet.');
    manualIntentRef.current = true;
    setManualCapturePending(true);
    try {
      const file = await captureCanvasSnapshot(canvas);
      const project = await uploadDocumentThumbnail(projectId, file, 'manual');
      if (mountedRef.current) setMode(project.thumbnailMode);
    } catch (error) {
      manualIntentRef.current = mode === 'manual';
      throw error;
    } finally {
      if (mountedRef.current) setManualCapturePending(false);
    }
  }, [canvasRef, mode, projectId, workspaceId]);

  const prepareDocumentExit = useCallback(() => {
    if (exitStartedRef.current || !projectId || !workspaceId) return;
    exitStartedRef.current = true;
    // Freeze a small scene before React removes the editor. All image decoding,
    // drawing and compression happen in a worker, not via a DOM screenshot.
    const canvas = canvasRef.current;
    const scene = canvas && !manualIntentRef.current && mode !== 'manual'
      ? collectCanvasOverview(useProductionGraphStore.getState(), canvas) : undefined;
    const saved = prepareExit();
    const preview = scene?.cards.length ? renderCanvasOverview(scene) : Promise.resolve(undefined);
    void Promise.all([saved, preview]).then(async ([revision, file]) => {
      if (file) await uploadDocumentThumbnail(projectId, file, 'auto', revision);
      window.dispatchEvent(new Event(DOCUMENT_PREVIEW_UPDATED));
    }).catch((error: unknown) => {
      // Recovery storage retains unsaved edits. A failed overview never blocks Back.
      console.warn('Background document exit failed', {
        projectId, errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    });
  }, [canvasRef, mode, prepareExit, projectId, workspaceId]);

  return { createManualSnapshot, prepareDocumentExit, manualCapturePending, thumbnailMode: mode };
}
