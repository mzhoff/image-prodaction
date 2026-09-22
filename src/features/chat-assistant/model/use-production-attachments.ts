'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { optimizeChatImageFile, useChatAttachments } from '@prodactionpro/chat-runtime-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent } from 'react';
import { isHeicImageFile } from '@/shared/lib/normalize-image-file';
import { CHAT_COMPOSER_MIME_TYPES } from '@/modules/chat-assistant/contracts/composer-attachments';
import type { createImageProductionChatClient } from '@/modules/chat-assistant/adapters/client/chat-client';

const UPLOAD_TYPES = [...CHAT_COMPOSER_MIME_TYPES, 'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'];
const normalize = (file: File) => isHeicImageFile(file) ? new File([file], file.name, { type: 'image/heic' }) : file;

export function useProductionAttachments(workspaceId: string, transport: ReturnType<typeof createImageProductionChatClient>) {
  const tUi = useTranslations();
  const preprocessFile = useCallback(async (file: File) => {
    if (!file.size || file.size > 8 * 1024 * 1024) throw new Error(tUi("Нужен непустой файл размером до 8 МБ."));
    if (isHeicImageFile(file)) {
      const response = await fetch('/api/chat/v1/references/convert', { method: 'POST', body: file,
        headers: { 'Content-Type': 'application/octet-stream', 'x-workspace-id': workspaceId }, signal: AbortSignal.timeout(35_000) });
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error ?? tUi("Не удалось обработать HEIC. Повторите загрузку.")); }
      return new File([await response.blob()], file.name.replace(/\.hei[cf]$/i, '') + '.webp', { type: 'image/webp' });
    }
    return optimizeChatImageFile(file, { maxSide: 2048, outputMimeType: 'image/webp', quality: .88, targetFileBytes: 6 * 1024 * 1024 });
  }, [tUi, workspaceId]);
  // ChatModule owns one immutable upload queue per mounted conversation. Unlike
  // memo/callback caches, state survives Fast Refresh without changing its options.
  const [queue] = useState(() => ({ workspaceId, options: { transport, allowedMimeTypes: UPLOAD_TYPES, imageOptimization: false as const,
    preprocessFile, maxFileBytes: 8 * 1024 * 1024, maxFiles: 3 } }));
  if (queue.workspaceId !== workspaceId) throw new Error('Remount the conversation before switching its workspace.');
  const controller = useChatAttachments(queue.options);
  const submitLocks = useRef(0);
  const mounted = useRef(true);
  const [locked, setLocked] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const lockForSubmit = useCallback(() => {
    submitLocks.current++;
    if (mounted.current) setLocked(true);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      submitLocks.current--;
      if (mounted.current) setLocked(submitLocks.current > 0);
    };
  }, []);
  const { addFiles: enqueue, acceptsFile: accepts } = controller;
  // Guard the underlying queue, including callbacks captured before React rerenders.
  const addFiles = useCallback((files: Iterable<File> | ArrayLike<File>) => submitLocks.current
    ? Promise.resolve() : enqueue(Array.from(files).map(normalize)), [enqueue]);
  const acceptsFile = useCallback((file: File) => accepts(normalize(file)), [accepts]);
  const onDrop = (event: DragEvent) => { event.preventDefault(); event.stopPropagation(); void addFiles(Array.from(event.dataTransfer.files)); };
  const onPaste = (event: ClipboardEvent) => {
    const files = Array.from(event.clipboardData.files);
    if (!files.length) return;
    if (!event.clipboardData.getData('text/plain')) event.preventDefault();
    void addFiles(files);
  };
  const canAdd = !locked && controller.canAdd;
  const dropTarget = useMemo(() => ({ ...controller.dropTarget, canAdd, addFiles, acceptsFile }), [controller.dropTarget, canAdd, addFiles, acceptsFile]);
  return { ...controller, addFiles, acceptsFile, onDrop, onPaste, dropTarget, canAdd, lockForSubmit,
    canSubmit: !locked && controller.canSubmit,
    cancel: (id: string) => { if (!submitLocks.current) controller.cancel(id); },
    remove: (id: string) => submitLocks.current ? Promise.resolve() : controller.remove(id),
    retry: (id: string) => submitLocks.current ? Promise.resolve() : controller.retry(id),
    clear: () => submitLocks.current ? Promise.resolve() : controller.clear(),
    onDragOver: (event: DragEvent<HTMLElement>) => { if (!submitLocks.current) controller.onDragOver(event); },
    // clearAfterSend intentionally remains available to finish the locked transaction.
    inputProps: { ...controller.inputProps, disabled: locked, accept: `${controller.inputProps.accept},.heic,.heif`, onChange: (event: ChangeEvent<HTMLInputElement>) => {
      void addFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = '';
    } } };
}
