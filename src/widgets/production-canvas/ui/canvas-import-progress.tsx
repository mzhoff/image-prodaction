'use client';

import { ProcessIndicator } from '@/shared/ui/process-indicator';
import { estimateRemainingTime } from '@/shared/ui/process-indicator-values';
import { useEffect } from 'react';
import { useStore } from 'zustand';
import type { CanvasImportProgressStore } from '../model/canvas-import-progress';

const stageLabels = {
  preparing: 'Подготавливаем файлы',
  converting: 'Конвертируем HEIC в JPEG',
  uploading: 'Загружаем файл',
  adding: 'Добавляем на канвас',
  done: 'Импорт завершён',
};

export function CanvasImportProgressCard({ store }: { store: CanvasImportProgressStore }) {
  const progress = useStore(store, (state) => state.progress);
  const done = progress?.phase === 'done';
  const failed = progress?.failed ?? 0;
  useEffect(() => {
    if (!done || failed) return;
    const timer = setTimeout(() => store.setState({ progress: null }), 5000);
    return () => clearTimeout(timer);
  }, [done, failed, store]);

  if (!progress) return null;
  const processed = progress.completed + progress.failed;
  const title = done
    ? failed ? 'Импорт завершён с ошибками' : 'Импорт завершён'
    : progress.imagesOnly ? 'Загружаем изображения' : 'Загружаем файлы';
  const description = done
    ? `Добавлено: ${progress.completed} из ${progress.total}${failed ? ` · Не удалось: ${failed}` : ''}`
    : `${stageLabels[progress.phase]}${progress.fileName ? ` · ${progress.fileName}` : ''}`;
  return <ProcessIndicator className="canvas-import-progress" label="Импорт файлов"
    title={title} description={description} state={done ? failed ? 'error' : 'success' : 'running'}
    completed={processed} total={progress.total} countLabel={`${processed} / ${progress.total}`}
    estimatedRemainingMs={estimateRemainingTime(progress.elapsedMs, processed, progress.total)}
    progressLabel="Обработано файлов" dismissLabel="Закрыть статус импорта"
    onDismiss={done ? () => store.setState({ progress: null }) : undefined}>
    {progress.phase === 'converting' ? <p>Фотографии с iPhone требуют конвертации. Большие файлы могут занять больше времени.</p> : null}
    {progress.lastError ? <p className="canvas-import-progress-error">{done ? progress.lastError : `Не удалось загрузить: ${failed}. Продолжаем остальные файлы.`}</p> : null}
  </ProcessIndicator>;
}
