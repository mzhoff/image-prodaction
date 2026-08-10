'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { uploadDocumentThumbnail } from '@/entities/document/api/document-api';
import { captureCanvasSnapshot } from '../lib/canvas-snapshot';

type ThumbnailMode = 'auto' | 'manual';
const AUTO_CAPTURE_WARMUP_MS = 6_000;

interface UseDocumentThumbnailSyncOptions {
  canvasRef: RefObject<HTMLDivElement | null>;
  projectId?: string;
  saveSequence: number;
  serverMode: ThumbnailMode;
  workspaceId?: string;
}

export function useDocumentThumbnailSync({
  canvasRef,
  projectId,
  saveSequence,
  serverMode,
  workspaceId,
}: UseDocumentThumbnailSyncOptions) {
  const [mode, setMode] = useState<ThumbnailMode>(serverMode);
  const [manualCapturePending, setManualCapturePending] = useState(false);
  const mountedRef = useRef(true);
  const modeRef = useRef<ThumbnailMode>(serverMode);
  const manualIntentRef = useRef(serverMode === 'manual');
  const autoQueuedRef = useRef(false);
  const autoCaptureReadyRef = useRef(false);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const lastSaveSequenceRef = useRef(saveSequence);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    modeRef.current = serverMode;
    manualIntentRef.current = serverMode === 'manual';
    setMode(serverMode);
  }, [projectId, serverMode]);

  useEffect(() => {
    autoCaptureReadyRef.current = false;
    lastSaveSequenceRef.current = -1;
    if (!projectId) return undefined;

    const timeoutId = window.setTimeout(() => {
      autoCaptureReadyRef.current = true;
    }, AUTO_CAPTURE_WARMUP_MS);
    return () => window.clearTimeout(timeoutId);
  }, [projectId]);

  const performCapture = useCallback(async (nextMode: ThumbnailMode) => {
    if (!projectId || !workspaceId) throw new Error('Document storage is not ready yet.');
    if (nextMode === 'auto' && (modeRef.current === 'manual' || manualIntentRef.current)) return;
    const canvas = canvasRef.current;
    if (!canvas) throw new Error('Canvas is not ready yet.');

    const file = await captureCanvasSnapshot(canvas);
    const project = await uploadDocumentThumbnail(projectId, file, nextMode);
    modeRef.current = project.thumbnailMode;
    manualIntentRef.current = project.thumbnailMode === 'manual';
    if (mountedRef.current) setMode(project.thumbnailMode);
  }, [canvasRef, projectId, workspaceId]);

  const enqueueCapture = useCallback((nextMode: ThumbnailMode) => {
    if (nextMode === 'auto') {
      if (autoQueuedRef.current || modeRef.current === 'manual' || manualIntentRef.current) {
        return Promise.resolve();
      }
      autoQueuedRef.current = true;
    } else {
      manualIntentRef.current = true;
    }

    const capture = queueRef.current
      .catch(() => undefined)
      .then(() => performCapture(nextMode));
    queueRef.current = capture.catch(() => undefined);

    return capture.finally(() => {
      if (nextMode === 'auto') autoQueuedRef.current = false;
      if (nextMode === 'manual' && modeRef.current !== 'manual') manualIntentRef.current = false;
    });
  }, [performCapture]);

  useEffect(() => {
    if (saveSequence === lastSaveSequenceRef.current) return;
    lastSaveSequenceRef.current = saveSequence;
    if (!autoCaptureReadyRef.current) return;
    const cancelIdleCapture = scheduleIdleCapture(() => {
      void enqueueCapture('auto').catch((error: unknown) => {
        console.warn('Automatic document snapshot failed', {
          errorName: error instanceof Error ? error.name : 'UnknownError',
          projectId,
        });
      });
    });
    return cancelIdleCapture;
  }, [enqueueCapture, projectId, saveSequence]);

  const createManualSnapshot = useCallback(async () => {
    setManualCapturePending(true);
    try {
      await enqueueCapture('manual');
    } finally {
      if (mountedRef.current) setManualCapturePending(false);
    }
  }, [enqueueCapture]);

  return {
    createManualSnapshot,
    manualCapturePending,
    thumbnailMode: mode,
  };
}

function scheduleIdleCapture(callback: () => void) {
  if ('requestIdleCallback' in window) {
    const idleId = window.requestIdleCallback(callback, { timeout: 4_000 });
    return () => window.cancelIdleCallback(idleId);
  }

  const timeoutId = setTimeout(callback, 1_500);
  return () => clearTimeout(timeoutId);
}
