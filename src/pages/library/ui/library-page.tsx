'use client';
import { useFormatLocale } from '@/shared/i18n/use-format-locale';
import { useTranslations } from '@/shared/i18n/use-translations';

import {
  RotateCcw,
  Search,
  LayoutGrid,
  CalendarDays,
  SlidersHorizontal,
  X,
} from '@prodactionpro/ui-core/icons';
import { useId, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useWorkspaceSearchDialog } from '@/pages/workspace/ui/workspace-search-provider';
import { WorkspacePage } from '@/pages/workspace/ui/workspace-page';
import { StudioFoldersPage } from '@/pages/workspace/ui/studio-folders-page';
import { SubjectLibraryPage } from './subject-library-page';
import { VideoStyleLibraryPage } from './video-style-library-page';
import type { ReactNode } from 'react';
import { ProductionSectionLayout } from '@/shared/ui/production-section-layout';
import { ProductionEmptyState } from '@/shared/ui/production-empty-state';
import { hasLibraryFilters, emptyLibraryFilters } from '../model/library-filters';
import { useLibrary } from '../model/library-context';
import { LibraryGallery } from './library-gallery';
import { LibrarySelectionToolbar } from './library-asset-actions';
import { LibraryNavigation } from './library-navigation';
import { LibraryMediaFilters } from './library-media-filters';

export function LibraryPage() {
  const section = useSearchParams()?.get('section');
  const navigation = <LibraryNavigation section={section} />;
  if (section === 'pipelines') return <WorkspacePage libraryOnly navigation={navigation} />;
  if (section === 'projects') return <StudioFoldersPage library navigation={navigation} />;
  if (section === 'subjects') return <SubjectLibraryPage navigation={navigation} />;
  if (section === 'styles') return <VideoStyleLibraryPage navigation={navigation} />;
  return <LibraryAssetsPage navigation={navigation} />;
}

function LibraryAssetsPage({ navigation }: { navigation: ReactNode }) {
  const language = useFormatLocale();
  const tUi = useTranslations();
  const library = useLibrary();
  const openSearch = useWorkspaceSearchDialog();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersId = useId();
  const activeFilters = Object.entries(library.filters).filter(([key, value]) => key !== 'q' && Boolean(value)).length;
  const controls = filtersOpen || library.filters.q ? <section className="library-toolbar" aria-label={tUi("Фильтры библиотеки")}>
    {filtersOpen ? <div id={filtersId}><LibraryMediaFilters filters={library.filters} facets={library.facets} onChange={library.setFilters} /></div> : null}
    {library.filters.q ? <button className="library-query-chip" type="button" aria-label={tUi("Убрать поисковый запрос")}
      onClick={() => library.setFilters({ q: '' })}><Search size={13} /><span>{library.filters.q}</span><X size={13} /></button> : null}
  </section> : null;

  return <ProductionSectionLayout title="Library" className="library-section" navigation={navigation} controls={controls}
    tools={<>
      <span className="production-section-status" role="status">{library.loading
        ? tUi("Собираем медиатеку…") : `${library.items.length} ${pluralizeAssets(library.items.length, language)}`}</span>
      <div className="library-header-tools">
        <button type="button" className="library-tool-button library-refresh-button" disabled={library.loading}
          aria-label={tUi("Обновить библиотеку")} title={tUi("Обновить библиотеку")} onClick={() => void library.refresh()}><RotateCcw size={17} /></button>
        <button type="button" className="library-tool-button" aria-label={activeFilters ? tUi("Фильтры: {p1}", { p1: activeFilters }) : tUi("Фильтры")} title={tUi("Фильтры")}
          aria-expanded={filtersOpen} aria-controls={filtersOpen ? filtersId : undefined} data-active={activeFilters > 0 || filtersOpen}
          onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={17} />{activeFilters ? <span className="library-filter-count">{activeFilters}</span> : null}</button>
        <button type="button" className="library-tool-button" aria-label={tUi("Поиск по библиотеке")} title={tUi("Поиск")} aria-haspopup="dialog"
          onClick={() => openSearch({ scope: 'media', query: library.filters.q, mediaFilters: library.filters, mediaFacets: library.facets, onApplyMediaFilters: library.setFilters })}><Search size={17} /></button>
      </div>
    </>}
    actions={
      <div className="library-view-switch" role="group" aria-label={tUi("Вид библиотеки")}>
        <button type="button" aria-pressed={library.view === 'gallery'} onClick={() => library.setView('gallery')}><LayoutGrid size={16} />{tUi("Галерея")}</button>
        <button type="button" aria-pressed={library.view === 'dates'} onClick={() => library.setView('dates')}><CalendarDays size={16} />{tUi("По датам")}</button>
      </div>
    }>
    <section className="library-results" aria-labelledby="library-grid-title">
      <h2 id="library-grid-title" className="library-sr-only">{tUi("Медиатека")}</h2>
      <LibrarySelectionToolbar />

      {library.loading ? <LibrarySkeleton /> : null}
      {!library.loading && library.error ? (
        <div className="library-state" role="alert">
          <span><RotateCcw size={22} /></span>
          <h3>{tUi("Библиотека пока недоступна")}</h3>
          <p>{typeof (library.error) === 'string' ? tUi((library.error) as string) : (library.error)}</p>
          <button type="button" onClick={() => void library.refresh()}>{tUi("Повторить")}</button>
        </div>
      ) : null}
      {!library.loading && !library.error && library.items.length === 0 ? (
        <ProductionEmptyState kind="library" title={hasLibraryFilters(library.filters) ? tUi("Материалы не найдены") : undefined}
          description={hasLibraryFilters(library.filters) ? tUi("Попробуйте другое название или уберите фильтры.") : undefined}
          action={hasLibraryFilters(library.filters) ? { label: tUi("Сбросить фильтры"), onClick: () => library.setFilters(emptyLibraryFilters) }
            : { label: tUi("Создать изображение"), href: '/create?type=image' }} />
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
          {library.loadingMore ? tUi("Загружаем…") : tUi("Показать ещё")}
        </button>
      ) : null}
    </section>
  </ProductionSectionLayout>;
}

function LibrarySkeleton() {
  const tUi = useTranslations();
  return (
    <div className="library-grid" aria-label={tUi("Медиатека загружается")} aria-busy="true">
      {Array.from({ length: 8 }, (_, index) => (
        <div className="library-card library-card-skeleton" key={index}>
          <div className="library-card-preview" />
        </div>
      ))}
    </div>
  );
}

function pluralizeAssets(count: number, language = 'ru-RU') {
  if (language === 'en-US') return count === 1 ? 'item' : 'items';
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return 'объектов';
  if (last === 1) return 'объект';
  if (last >= 2 && last <= 4) return 'объекта';
  return 'объектов';
}
