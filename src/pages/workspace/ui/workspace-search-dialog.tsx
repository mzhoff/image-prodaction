'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import Link from 'next/link';
import { useId, useState } from 'react';
import { ArrowLeft, Film, Folder, Images, LayoutGrid, PanelsTopLeft, Route, Search, SlidersHorizontal, X } from '@prodactionpro/ui-core/icons';
import { GalleryDialog } from '@/shared/ui/gallery-dialog';
import { LibraryMediaFilters } from '@/pages/library/ui/library-media-filters';
import { emptyLibraryFilters, hasLibraryFilters } from '@/pages/library/model/library-filters';
import type { LibraryFacets, LibraryFilters } from '@/pages/library/model/types';
import { workspaceSearchMediaFilters } from '../model/workspace-search-media';
import { useWorkspaceSearch } from '../model/use-workspace-search';
import type { WorkspaceSearchItem, WorkspaceSearchScope } from '../model/workspace-search';
import { useWorkspaceShell } from './workspace-shell-context';

const scopes = [
  { id: 'all', label: 'Все файлы', Icon: LayoutGrid },
  { id: 'flows', label: 'Flows', Icon: Route },
  { id: 'projects', label: 'Проекты', Icon: Folder },
  { id: 'media', label: 'Медиа', Icon: Images },
  { id: 'storyboard', label: 'Storyboard', Icon: PanelsTopLeft },
  { id: 'timeline', label: 'Timeline', Icon: Film },
] as const;

export function WorkspaceSearchDialog({ initialScope, initialQuery, initialMediaFilters, initialMediaFacets, onApplyMediaFilters, onClose }: {
  initialScope: WorkspaceSearchScope; initialQuery: string; onClose: () => void;
  initialMediaFilters?: LibraryFilters; initialMediaFacets?: LibraryFacets; onApplyMediaFilters?: (filters: LibraryFilters) => void;
}) {
  const tUi = useTranslations();
  const ui_scopes = useUiCatalog(scopes, tUi);
  const workspace = useWorkspaceShell();
  const [scope, setScope] = useState(initialScope);
  const [query, setQuery] = useState(initialQuery);
  const [mediaFilters, setMediaFilters] = useState(initialMediaFilters ?? emptyLibraryFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersId = useId();
  const filtersCount = Object.entries(mediaFilters).filter(([key, value]) => key !== 'q' && Boolean(value)).length;
  const supportsFilters = scope === 'media' || scope === 'all';
  const [preview, setPreview] = useState<WorkspaceSearchItem | null>(null);
  const narrowed = Boolean(query.trim()) || ((scope === 'media' || scope === 'all') && hasLibraryFilters({ ...mediaFilters, q: '' }));
  const search = useWorkspaceSearch({ workspaceId: workspace.activeWorkspace?.id,
    projects: workspace.projects, folders: workspace.folders, scope, query, mediaFilters });
  return <GalleryDialog label={tUi("Поиск в Workspace")} className="workspace-search-dialog" onClose={onClose}>
    <header className="production-gallery-header">
      <div><h2>{tUi("Поиск")}</h2><p>{workspace.activeWorkspace?.name ?? tUi("Загружаем рабочее пространство…")}</p></div>
      <button type="button" className="production-gallery-close" aria-label={tUi("Закрыть поиск")} onClick={onClose}><X size={18} /></button>
    </header>
    <div className="workspace-search-content">
      <div className="workspace-search-toolbar">
        <form role="search" className="workspace-search-input" onSubmit={(event) => event.preventDefault()}>
          <Search size={18} /><input data-gallery-autofocus type="search" aria-label={tUi("Найти файлы в Workspace")} placeholder={tUi("Название файла, проекта или медиа")} value={query}
            onChange={(event) => { setQuery(event.target.value); setPreview(null); }} />
        </form>
        <button type="button" className="workspace-search-filter-toggle" aria-label={filtersCount && supportsFilters ? tUi("Фильтры · {p1}", { p1: filtersCount }) : tUi("Фильтры")}
          title={tUi("Фильтры")} aria-expanded={filtersOpen && supportsFilters && !preview} aria-controls={filtersId}
          onClick={() => { setFiltersOpen(!filtersOpen || !supportsFilters || Boolean(preview)); if (!supportsFilters) setScope('media'); setPreview(null); }}>
          <SlidersHorizontal size={18} />{filtersCount && supportsFilters ? <span className="library-filter-count">{filtersCount}</span> : null}
        </button>
      </div>
      <div className="workspace-search-layout">
        <nav className="workspace-search-scopes" aria-label={tUi("Где искать")}>
          {ui_scopes.map(({ id, label, Icon }) => <button key={id} type="button" aria-pressed={scope === id}
            onClick={() => { setScope(id); setPreview(null); }}><Icon size={18} /><span>{label}</span></button>)}
        </nav>
        <div className="workspace-search-results">
          {!preview && supportsFilters && filtersOpen ? <section id={filtersId} className="workspace-search-media-filters" aria-label={tUi("Фильтры")}>
            <div className="workspace-search-media-filter-heading"><span>{tUi("Фильтры")}</span>
              {onApplyMediaFilters && scope === 'media' ? <button type="button" onClick={() => {
                onApplyMediaFilters(workspaceSearchMediaFilters(query, mediaFilters)); onClose();
              }}>{tUi("Показать в библиотеке")}</button> : null}</div>
            <LibraryMediaFilters filters={{ ...mediaFilters, q: query }} facets={search.mediaFacets ?? initialMediaFacets ?? {}}
              onChange={(patch) => { setMediaFilters((current) => ({ ...current, ...patch })); if (patch.q !== undefined) setQuery(patch.q); setPreview(null); }} />
          </section> : null}
          {preview ? <MediaSearchPreview item={preview} onBack={() => setPreview(null)} /> : <>
            <div className="workspace-search-summary" role="status" aria-live="polite">
              {search.loading ? tUi("Ищем…") : `${narrowed ? tUi("Найдено") : tUi("Недавние файлы")} · ${search.items.length}${search.hasMore ? '+' : ''}`}
            </div>
            {search.error ? <div className="workspace-search-state" role="alert"><p>{typeof (search.error) === 'string' ? tUi((search.error) as string) : (search.error)}</p><button type="button" onClick={search.retry}>{tUi("Повторить")}</button></div> : null}
            <div className="workspace-search-grid" aria-busy={search.loading}>
              {search.items.map((item) => <SearchCard key={item.id} item={item} onOpenMedia={setPreview} onClose={onClose} />)}
            </div>
            {!search.loading && !search.error && !search.items.length ? <div className="workspace-search-state"><Search size={28} /><h3>{narrowed ? tUi("Ничего не найдено") : tUi("Пока нет файлов")}</h3><p>{narrowed ? tUi("Измените запрос, фильтры или раздел.") : tUi("Здесь появятся файлы текущего рабочего пространства.")}</p></div> : null}
            {search.hasMore ? <button className="workspace-search-more" type="button" disabled={search.loadingMore || search.loading} onClick={() => void search.loadMore()}>{search.loadingMore ? tUi("Загружаем…") : tUi("Показать ещё")}</button> : null}
          </>}
        </div>
      </div>
    </div>
  </GalleryDialog>;
}

function SearchCard({ item, onOpenMedia, onClose }: {
  item: WorkspaceSearchItem; onOpenMedia: (item: WorkspaceSearchItem) => void; onClose: () => void;
}) {
  const tUi = useTranslations();
  const ui_scopes = useUiCatalog(scopes, tUi);
  const kind = ui_scopes.find((candidate) => candidate.id === item.kind)!;
  const Icon = kind.Icon;
  const content = <><span className={`workspace-search-preview workspace-search-preview-${item.kind}`}>
    {item.previewUrl ? <img src={item.previewUrl} alt="" loading="lazy" draggable={false} /> : <Icon size={38} strokeWidth={1.1} />}
    <span className="workspace-search-kind"><Icon size={12} />{item.mediaKind === 'video' ? tUi("Видео") : kind.label}</span>
  </span><strong>{item.name}</strong><small>{item.description || kind.label}</small></>;
  return item.kind === 'media'
    ? <button className="workspace-search-card" type="button" onClick={() => onOpenMedia(item)}>{content}</button>
    : <Link className="workspace-search-card" href={item.href} prefetch={false} onClick={onClose}>{content}</Link>;
}

function MediaSearchPreview({ item, onBack }: { item: WorkspaceSearchItem; onBack: () => void }) {
  const tUi = useTranslations();
  return <div className="workspace-search-media">
    <button type="button" className="workspace-search-back" onClick={onBack}><ArrowLeft size={16} />{tUi("К результатам")}</button>
    {item.mediaKind === 'video' ? <video src={item.contentUrl} poster={item.previewUrl} controls playsInline preload="metadata" />
      : <img src={item.contentUrl ?? item.previewUrl} alt={item.name} draggable={false} />}
    <h3>{item.name}</h3><p>{item.description}</p>
  </div>;
}
