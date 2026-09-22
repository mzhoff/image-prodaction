'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

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
  const tUi = useTranslations();
  const ui_stageLabels = useUiCatalog(stageLabels, tUi);
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
    ? failed ? tUi("Импорт завершён с ошибками") : tUi("Импорт завершён")
    : progress.imagesOnly ? tUi("Загружаем изображения") : tUi("Загружаем файлы");
  const description = done
    ? tUi("Добавлено: {p1} из {p2}{p3}", { p1: progress.completed, p2: progress.total, p3: failed ? ` · Не удалось: ${failed}` : '' })
    : `${ui_stageLabels[progress.phase]}${progress.fileName ? ` · ${progress.fileName}` : ''}`;
  return <ProcessIndicator className="canvas-import-progress" label={tUi("Импорт файлов")}
    title={title} description={description} state={done ? failed ? 'error' : 'success' : 'running'}
    completed={processed} total={progress.total} countLabel={`${processed} / ${progress.total}`}
    estimatedRemainingMs={estimateRemainingTime(progress.elapsedMs, processed, progress.total)}
    progressLabel={tUi("Обработано файлов")} dismissLabel={tUi("Закрыть статус импорта")}
    onDismiss={done ? () => store.setState({ progress: null }) : undefined}>
    {progress.phase === 'converting' ? <p>{tUi("Фотографии с iPhone требуют конвертации. Большие файлы могут занять больше времени.")}</p> : null}
    {progress.lastError ? <p className="canvas-import-progress-error">{done ? progress.lastError : tUi("Не удалось загрузить: {p1}. Продолжаем остальные файлы.", { p1: failed })}</p> : null}
  </ProcessIndicator>;
}
