'use client';

import {
  LibraryBig,
  RotateCcw,
  Search,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { BrandSelect } from '@/shared/ui/brand-select';
import type { BrandSelectOption } from '@/shared/ui/brand-select';
import { hasLibraryFilters, emptyLibraryFilters } from '../model/library-filters';
import { useLibrary } from '../model/library-context';
import type { LibraryFacetOption } from '../model/types';
import { LibraryCard } from './library-card';

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
  const library = useLibrary();
  const [search, setSearch] = useState(library.filters.q);
  const modelOptions = useMemo(
    () => facetOptions('Все модели', library.facets.models),
    [library.facets.models],
  );
  const projectOptions = useMemo(
    () => facetOptions('Все проекты', library.facets.documents),
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
          <h1>Библиотека</h1>
        </div>
        <p>
          {library.loading
            ? 'Собираем медиатеку…'
            : `${library.items.length} ${pluralizeAssets(library.items.length)}`}
        </p>
      </header>

      <div className="workspace-content library-content">
        <section className="library-toolbar" aria-label="Фильтры библиотеки">
          <form className="library-search" role="search" onSubmit={submitSearch}>
            <Search size={17} />
            <input
              type="search"
              aria-label="Поиск по библиотеке"
              placeholder="Имя файла, модель или операция"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button type="submit">Найти</button>
          </form>

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
          <div className="library-results-head">
            <div>
              <h2 id="library-grid-title">Медиатека</h2>
              <p>Загрузки, генерации и сохранённые результаты в одном месте.</p>
            </div>
          </div>

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
            <div className="library-grid" aria-label="Медиатека">
              {library.items.map((item) => (
                <LibraryCard item={item} filterQuery={library.filterQuery} key={item.id} />
              ))}
            </div>
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
          <div className="library-card-body"><i /><i /></div>
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
