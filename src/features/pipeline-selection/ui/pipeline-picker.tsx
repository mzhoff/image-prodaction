'use client';
import { useFormatLocale } from '@/shared/i18n/use-format-locale';
import { useTranslations } from '@/shared/i18n/use-translations';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Check, Folder, LoaderCircle, RefreshCw, Route, Search, X } from '@prodactionpro/ui-core/icons';
import { GalleryDialog } from '@/shared/ui/gallery-dialog';
import type { ExecutablePipelineCatalogItem } from '@/modules/executable-pipelines/contracts/pipeline-catalog-contracts';
import { usePipelineCatalog } from '../model/use-pipeline-catalog';
import './pipeline-picker.css';

export function PipelinePicker({ open, workspaceId, selectedPublicId, onClose, onSelect }: {
  open: boolean; workspaceId?: string; selectedPublicId?: string;
  onClose(): void; onSelect(pipeline: ExecutablePipelineCatalogItem): void;
}) {
  const language = useFormatLocale();
  const tUi = useTranslations();
  const catalog = usePipelineCatalog(workspaceId, open);
  const [search, setSearch] = useState('');
  if (!open) return null;
  const query = search.trim().toLocaleLowerCase(language);
  const pipelines = catalog.pipelines.filter((item) => [item.name, item.originDocumentName, item.description].some((value) => value?.toLocaleLowerCase(language).includes(query)));
  return <GalleryDialog label={tUi("Выберите pipeline")} className="pipeline-picker-dialog workspace-search-dialog" onClose={onClose}>
    <header className="production-gallery-header"><div><h2>{tUi("Выберите pipeline")}</h2><p>{tUi("Готовые к запуску версии из ваших Flow.")}</p></div>
      <button type="button" className="production-gallery-close" aria-label={tUi("Закрыть выбор pipeline")} onClick={onClose}><X size={18} /></button></header>
    <div className="pipeline-picker-content">
      <div className="workspace-search-toolbar"><label className="workspace-search-input"><Search size={17} />
        <input data-gallery-autofocus aria-label={tUi("Найти pipeline")} placeholder={tUi("Название pipeline или исходного Flow")} value={search} onChange={(event) => setSearch(event.target.value)} />
      </label><button type="button" className="workspace-search-filter-toggle" disabled={catalog.loading} title={tUi("Обновить список")} aria-label={tUi("Обновить список pipeline")} onClick={catalog.refresh}><RefreshCw size={17} /></button></div>
      <div className="pipeline-picker-list">
        {catalog.loading ? <div className="pipeline-picker-state" role="status"><LoaderCircle className="playground-spinner" size={22} />{tUi("Загружаем pipeline…")}</div>
          : catalog.error ? <div className="pipeline-picker-state" role="alert"><p>{typeof (catalog.error) === 'string' ? tUi((catalog.error) as string) : (catalog.error)}</p><button type="button" onClick={catalog.refresh}>{tUi("Попробовать снова")}</button></div>
          : !workspaceId ? <div className="pipeline-picker-state">{tUi("Выберите рабочее пространство.")}</div>
          : pipelines.length ? pipelines.map((pipeline) => <button type="button" className="pipeline-picker-card" key={pipeline.pipelineId}
            aria-label={tUi("Выбрать {p1}, версия {p2}", { p1: pipeline.name, p2: pipeline.version })} onClick={() => onSelect(pipeline)}>
            <span className="pipeline-picker-icon"><Route size={24} /></span><span className="pipeline-picker-copy">
              <span className="pipeline-picker-title"><strong>{pipeline.name}</strong><small>v{pipeline.version}</small></span>
              <span className="pipeline-picker-origin"><Folder size={13} />{pipeline.originDocumentName ?? tUi("Сохранённый pipeline")}</span>
              {pipeline.description ? <span className="pipeline-picker-description">{pipeline.description}</span> : null}
              <span className="pipeline-picker-io">{tUi("Входы:")}{' '} {pipeline.inputs.length}  {' '}{tUi("· Выходы:")}{' '} {pipeline.outputs.length}</span>
            </span>{selectedPublicId === pipeline.endpointPublicId ? <Check size={18} /> : <ArrowRight size={18} />}
          </button>) : <div className="pipeline-picker-state"><Route size={30} /><h3>{search ? tUi("Ничего не найдено") : tUi("Пока нет готовых pipeline")}</h3>
            <p>{search ? tUi("Попробуйте другое название.") : tUi("В своём Flow выберите секцию и нажмите Make executable. Сохранённая версия появится здесь.")}</p>
            {search ? <button type="button" onClick={() => setSearch('')}>{tUi("Сбросить поиск")}</button> : <Link href="/flows" onClick={onClose}>{tUi("Открыть мои Flows")}{' '} <ArrowRight size={14} /></Link>}</div>}
      </div>
    </div>
  </GalleryDialog>;
}
