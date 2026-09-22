'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import { RotateCcw } from '@prodactionpro/ui-core/icons';
import { FilterSelect } from '@/shared/ui/filter-select';
import { useWorkspaceShell } from '@/pages/workspace/ui/workspace-shell-context';
import { emptyLibraryFilters, hasLibraryFilters } from '../model/library-filters';
import type { LibraryFacets, LibraryFilters, LibraryFacetOption } from '../model/types';
import './library-toolbar.css';

const origins = [
  { value: '', label: 'Все источники' }, { value: 'uploaded', label: 'Загруженные' },
  { value: 'generated', label: 'Сгенерированные' }, { value: 'saved', label: 'Сохранённые' },
  { value: 'unknown', label: 'Без источника' },
];
const mediaKinds = [{ value: '', label: 'Все типы' }, { value: 'image', label: 'Изображения' }, { value: 'video', label: 'Видео' }];

/** The same media controls are used in Library and the universal search dialog. */
export function LibraryMediaFilters({ filters, facets, onChange }: {
  filters: LibraryFilters; facets: LibraryFacets; onChange: (patch: Partial<LibraryFilters>) => void;
}) {
  const tUi = useTranslations();
  const ui_origins = useUiCatalog(origins, tUi);
  const ui_mediaKinds = useUiCatalog(mediaKinds, tUi);
  const workspace = useWorkspaceShell();
  const folders = workspace.folders.filter((item) => item.workspaceId === workspace.activeWorkspace?.id);
  return <div className="library-media-filters">
    <FilterSelect className="library-media-filter" label={tUi("Источник")} value={filters.origin} options={withCounts(ui_origins, facets.origins)} onChange={(origin) => onChange({ origin })} />
    <FilterSelect className="library-media-filter" label={tUi("Тип медиа")} value={filters.mediaKind} options={withCounts(ui_mediaKinds, facets.mediaKinds)} onChange={(mediaKind) => onChange({ mediaKind })} />
    <FilterSelect className="library-media-filter" label={tUi("Модель")} value={filters.modelId} options={[{ value: '', label: tUi("Все модели") }, ...facets.models ?? []]} onChange={(modelId) => onChange({ modelId })} />
    <FilterSelect className="library-media-filter" label={tUi("Проект")} value={filters.folderId ?? ''} options={[{ value: '', label: tUi("Все проекты") }, ...folders.map((item) => ({ value: item.id, label: item.name }))]} onChange={(folderId) => onChange({ folderId, documentId: '' })} />
    <FilterSelect className="library-media-filter" label={tUi("Канвас")} value={filters.documentId} options={[{ value: '', label: tUi("Все канвасы") }, ...facets.documents ?? []]} onChange={(documentId) => onChange({ documentId })} />
    {hasLibraryFilters(filters) ? <button type="button" className="library-reset-filters" onClick={() => onChange(emptyLibraryFilters)}><RotateCcw size={14} />{tUi("Сбросить")}</button> : null}
  </div>;
}

function withCounts(options: LibraryFacetOption[], facets: LibraryFacetOption[] = []) {
  const counts = new Map(facets.map((item) => [item.value, item.count]));
  return options.map((item) => ({ ...item, count: counts.get(item.value) }));
}
