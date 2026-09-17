'use client';

import { Input as PuiInput } from '@prodactionpro/ui-core/input';

import {
  LibraryBig,
  RotateCcw,
  Search,
  LayoutGrid,
  CalendarDays,
} from '@prodactionpro/ui-core/icons';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useWorkspaceShell } from '@/pages/workspace/ui/workspace-shell-context';
import { WorkspacePage } from '@/pages/workspace/ui/workspace-page';
import { StudioFoldersPage } from '@/pages/workspace/ui/studio-folders-page';
import { SubjectLibraryPage } from './subject-library-page';
import type { FormEvent } from 'react';
import { BrandSelect } from '@/shared/ui/brand-select';
import type { BrandSelectOption } from '@/shared/ui/brand-select';
import { hasLibraryFilters, emptyLibraryFilters } from '../model/library-filters';
import { useLibrary } from '../model/library-context';
import type { LibraryFacetOption } from '../model/types';
import { LibraryGallery } from './library-gallery';
import { LibrarySelectionToolbar } from './library-asset-actions';

const originOptions: BrandSelectOption[] = [
  { value: '', label: 'Все источники' },
  { value: 'uploaded', label: 'Загруженные' },
  { value: 'generated', label: 'Сгенерированные' },
  { value: 'saved', label: 'Сохранённые' },
  { value: 'unknown', label: 'Без источника' },
];

const mediaOptions: BrandSelectOption[] = [
  { value: '', label: 'Все типы' },
  { value: 'image', label: 'Изображения' },
  { value: 'video', label: 'Видео' },
];

export function LibraryPage() {
  const section = useSearchParams()?.get('section');
  if (section === 'pipelines') return <WorkspacePage libraryOnly />;
  if (section === 'projects') return <StudioFoldersPage library />;
  if (section === 'subjects') return <SubjectLibraryPage />;
  return <LibraryAssetsPage />;
}

function LibraryAssetsPage() {
  const library = useLibrary();
  const workspace = useWorkspaceShell();
  const folders = workspace.folders.filter((folder) => folder.workspaceId === workspace.activeWorkspace?.id);
  const folder = folders.find((item) => item.id === library.filters.folderId);
  const [search, setSearch] = useState(library.filters.q);
  const modelOptions = useMemo(
    () => facetOptions('Все модели', library.facets.models),
    [library.facets.models],
  );
  const projectOptions = useMemo(
    () => facetOptions('Все канвасы', library.facets.documents),
    [library.facets.documents],
  );
  const originsWithCounts = useMemo(
    () => applyFacetCounts(originOptions, library.facets.origins),
    [library.facets.origins],
  );
  const mediaWithCounts = useMemo(
    () => applyFacetCounts(mediaOptions, library.facets.mediaKinds),
    [library.facets.mediaKinds],
  );

  useEffect(() => setSearch(library.filters.q), [library.filters.q]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    library.setFilters({ q: search.trim() });
  }

  return (
    <>
      <header className="workspace-header library-header">
        <div>
          <span className="library-kicker"><LibraryBig size={14} /> Asset Library</span>
          <h1>{folder ? `Библиотека · ${folder.name}` : 'Библиотека'}</h1>
        </div>
        <p>
          {library.loading
            ? 'Собираем медиатеку…'
            : `${library.items.length} ${pluralizeAssets(library.items.length)}`}
        </p>
      </header>

      <div className="workspace-content library-content">
        <section className="library-toolbar" aria-label="Фильтры библиотеки">
          <div className="library-toolbar-top">
          <form className="library-search" role="search" onSubmit={submitSearch}>
            <Search size={17} />
            <PuiInput
              type="search"
              aria-label="Поиск по библиотеке"
              placeholder="Поиск в библиотеке"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button type="submit">Найти</button>
          </form>
          <div className="library-view-switch" role="group" aria-label="Вид библиотеки">
            <button type="button" aria-pressed={library.view === 'gallery'} onClick={() => library.setView('gallery')}><LayoutGrid size={16} />Галерея</button>
            <button type="button" aria-pressed={library.view === 'dates'} onClick={() => library.setView('dates')}><CalendarDays size={16} />По датам</button>
          </div>
          </div>

          <div className="library-filter-row">
            <BrandSelect
              label="Источник"
              value={library.filters.origin}
              options={originsWithCounts}
              onChange={(origin) => library.setFilters({ origin })}
            />
            <BrandSelect
              label="Тип медиа"
              value={library.filters.mediaKind}
              options={mediaWithCounts}
              onChange={(mediaKind) => library.setFilters({ mediaKind })}
            />
            <BrandSelect
              label="Модель"
              value={library.filters.modelId}
              options={modelOptions}
              onChange={(modelId) => library.setFilters({ modelId })}
            />
            <BrandSelect
              label="Проект"
              value={library.filters.folderId ?? ''}
              options={[{ value: '', label: 'Все проекты' }, ...folders.map((item) => ({ value: item.id, label: item.name }))]}
              onChange={(folderId) => library.setFilters({ folderId, documentId: '' })}
            />
            <BrandSelect
              label="Канвас"
              value={library.filters.documentId}
              options={projectOptions}
              onChange={(documentId) => library.setFilters({ documentId })}
            />
            {hasLibraryFilters(library.filters) ? (
              <button
                type="button"
                className="library-reset-filters"
                onClick={() => {
                  setSearch('');
                  library.setFilters(emptyLibraryFilters);
                }}
              >
                <RotateCcw size={14} />
                Сбросить фильтры
              </button>
            ) : null}
          </div>
        </section>

        <section className="library-results" aria-labelledby="library-grid-title">
          <h2 id="library-grid-title" className="library-sr-only">Медиатека</h2>
          <LibrarySelectionToolbar />

          {library.loading ? <LibrarySkeleton /> : null}
          {!library.loading && library.error ? (
            <div className="library-state" role="alert">
              <span><RotateCcw size={22} /></span>
              <h3>Библиотека пока недоступна</h3>
              <p>{library.error}</p>
              <button type="button" onClick={() => void library.refresh()}>Повторить</button>
            </div>
          ) : null}
          {!library.loading && !library.error && library.items.length === 0 ? (
            <div className="library-state">
              <span><LibraryBig size={24} /></span>
              <h3>{hasLibraryFilters(library.filters) ? 'Ничего не найдено' : 'Библиотека пока пуста'}</h3>
              <p>
                {hasLibraryFilters(library.filters)
                  ? 'Измените фильтры или поисковый запрос.'
                  : 'Загруженные изображения и результаты генераций появятся здесь автоматически.'}
              </p>
              {hasLibraryFilters(library.filters) ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    library.setFilters(emptyLibraryFilters);
                  }}
                >
                  Сбросить фильтры
                </button>
              ) : null}
            </div>
          ) : null}

          {!library.loading && !library.error && library.items.length > 0 ? (
            <LibraryGallery items={library.items} view={library.view} filterQuery={library.navigationQuery} />
          ) : null}

          {library.nextCursor ? (
            <button
              type="button"
              className="library-load-more"
              disabled={library.loadingMore}
              onClick={() => void library.loadMore()}
            >
              {library.loadingMore ? 'Загружаем…' : 'Показать ещё'}
            </button>
          ) : null}
        </section>
      </div>
    </>
  );
}

function LibrarySkeleton() {
  return (
    <div className="library-grid" aria-label="Медиатека загружается" aria-busy="true">
      {Array.from({ length: 8 }, (_, index) => (
        <div className="library-card library-card-skeleton" key={index}>
          <div className="library-card-preview" />
        </div>
      ))}
    </div>
  );
}

function facetOptions(allLabel: string, facets?: LibraryFacetOption[]): BrandSelectOption[] {
  return [
    { value: '', label: allLabel },
    ...(facets ?? []).filter((item) => item.value).map((item) => ({
      value: item.value,
      label: item.label,
      count: item.count,
    })),
  ];
}

function applyFacetCounts(options: BrandSelectOption[], facets?: LibraryFacetOption[]) {
  const counts = new Map((facets ?? []).map((item) => [item.value, item.count]));
  return options.map((option) => (
    option.value && counts.has(option.value)
      ? { ...option, count: counts.get(option.value) }
      : option
  ));
}

function pluralizeAssets(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return 'объектов';
  if (last === 1) return 'объект';
  if (last >= 2 && last <= 4) return 'объекта';
  return 'объектов';
}
