'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffectEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StorySummary } from '@/modules/story-projects/contracts/story-project';
import type { TimelineSummary } from '@/modules/story-projects/contracts/story-timeline';
import { fetchLibraryAssets } from '@/pages/library/api/library-api';
import { readLibraryFilters, writeLibraryFilters } from '@/pages/library/model/library-filters';
import type { LibraryAssetItem, LibraryFacets, LibraryFilters } from '@/pages/library/model/types';
import { loadStories } from '@/pages/stories/model/story-api';
import { loadTimelines } from '@/pages/stories/model/timeline-api';
import { normalizeWorkspaceSearchQuery, workspaceSearchIncludes, workspaceSearchItems, type WorkspaceSearchInput } from './workspace-search';
import { workspaceSearchMediaFilters } from './workspace-search-media';

interface DocumentState { key: string; stories: StorySummary[]; timelines: TimelineSummary[]; loading: boolean; error: string | null }
interface MediaState { key: string; items: LibraryAssetItem[]; facets?: LibraryFacets; cursor: string | null; loading: boolean; loadingMore: boolean; error: string | null }
interface MediaRequest { key: string; controller: AbortController; paging: boolean }
type WorkspaceSearchOptions = Pick<WorkspaceSearchInput, 'workspaceId' | 'projects' | 'folders' | 'scope' | 'query'> & { mediaFilters?: LibraryFilters };

export function useWorkspaceSearch({ workspaceId, projects, folders, scope, query, mediaFilters }: WorkspaceSearchOptions) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const normalizedQuery = normalizeWorkspaceSearchQuery(query);
  const mediaFilterKey = writeLibraryFilters(workspaceSearchMediaFilters(normalizedQuery, mediaFilters));
  const requestFilters = useMemo(() => readLibraryFilters(new URLSearchParams(mediaFilterKey)), [mediaFilterKey]);
  const [revision, setRevision] = useState(0);
  const [documents, setDocuments] = useState<DocumentState | null>(null);
  const [media, setMedia] = useState<MediaState | null>(null);
  const mediaRequest = useRef<MediaRequest | null>(null);
  const includeStories = workspaceSearchIncludes(scope, 'storyboard');
  const includeTimelines = workspaceSearchIncludes(scope, 'timeline');
  const includeMedia = workspaceSearchIncludes(scope, 'media');
  const documentKey = JSON.stringify([workspaceId, includeStories, includeTimelines, revision]);
  const mediaKey = JSON.stringify([workspaceId, scope, mediaFilterKey, revision]);

  useEffect(() => {
    if (!workspaceId || (!includeStories && !includeTimelines)) return;
    const controller = new AbortController();
    setDocuments({ key: documentKey, stories: [], timelines: [], loading: true, error: null });
    void Promise.allSettled([
      includeStories ? loadStories(workspaceId, controller.signal) : Promise.resolve({ stories: [] }),
      includeTimelines ? loadTimelines(workspaceId, controller.signal) : Promise.resolve({ timelines: [] }),
    ]).then(([stories, timelines]) => {
      if (controller.signal.aborted) return;
      const unavailable = [stories.status === 'rejected' ? tEffect("раскадровки") : '', timelines.status === 'rejected' ? tEffect("монтажи") : ''].filter(Boolean);
      setDocuments({ key: documentKey, loading: false,
        stories: stories.status === 'fulfilled' ? stories.value.stories : [],
        timelines: timelines.status === 'fulfilled' ? timelines.value.timelines : [],
        error: unavailable.length ? tEffect("Не удалось загрузить {p1}. Попробуйте ещё раз.", { p1: unavailable.join(' и ') }) : null });
    });
    return () => controller.abort();
  }, [documentKey, workspaceId, includeStories, includeTimelines]);

  useEffect(() => {
    if (!workspaceId || !includeMedia) return;
    const request: MediaRequest = { key: mediaKey, controller: new AbortController(), paging: false };
    mediaRequest.current = request;
    setMedia({ key: mediaKey, items: [], cursor: null, loading: true, loadingMore: false, error: null });
    const timer = setTimeout(() => {
      void fetchLibraryAssets(workspaceId, requestFilters, null, request.controller.signal)
        .then((result) => {
          if (request.controller.signal.aborted || mediaRequest.current !== request) return;
          setMedia({ key: mediaKey, items: result.items, facets: result.facets, cursor: result.nextCursor, loading: false, loadingMore: false, error: null });
        }).catch(() => {
          if (request.controller.signal.aborted || mediaRequest.current !== request) return;
          setMedia({ key: mediaKey, items: [], cursor: null, loading: false, loadingMore: false,
            error: tEffect("Не удалось найти медиа. Проверьте соединение и повторите поиск.") });
        });
    }, 200);
    return () => { clearTimeout(timer); request.controller.abort(); if (mediaRequest.current === request) mediaRequest.current = null; };
  }, [mediaKey, workspaceId, includeMedia, requestFilters]);

  const loadMore = useCallback(async () => {
    const request = mediaRequest.current;
    if (!workspaceId || !includeMedia || !request || request.key !== mediaKey || request.paging
      || request.controller.signal.aborted || media?.key !== mediaKey || media.loading || !media.cursor) return;
    request.paging = true;
    setMedia((current) => current?.key === mediaKey ? { ...current, loadingMore: true, error: null } : current);
    try {
      const result = await fetchLibraryAssets(workspaceId, requestFilters, media.cursor, request.controller.signal);
      if (request.controller.signal.aborted || mediaRequest.current !== request) return;
      setMedia((current) => current?.key === mediaKey ? { ...current,
        items: [...new Map([...current.items, ...result.items].map((item) => [item.id, item])).values()],
        facets: result.facets ?? current.facets, cursor: result.nextCursor === media.cursor ? null : result.nextCursor, loadingMore: false } : current);
    } catch {
      if (request.controller.signal.aborted || mediaRequest.current !== request) return;
      setMedia((current) => current?.key === mediaKey ? { ...current, loadingMore: false,
        error: tUi("Не удалось загрузить следующие медиа. Нажмите «Показать ещё», чтобы повторить.") } : current);
    } finally { request.paging = false; }
  }, [tUi, workspaceId, includeMedia, media, mediaKey, requestFilters]);

  const retry = useCallback(() => setRevision((value) => value + 1), []);
  const visibleDocuments = documents?.key === documentKey ? documents : null;
  const visibleMedia = media?.key === mediaKey ? media : null;
  const items = useMemo(() => workspaceSearchItems({ workspaceId, projects, folders, scope, query: normalizedQuery,
    stories: visibleDocuments?.stories, timelines: visibleDocuments?.timelines, media: visibleMedia?.items }),
  [workspaceId, projects, folders, scope, normalizedQuery, visibleDocuments, visibleMedia]);
  const error = [includeStories || includeTimelines ? visibleDocuments?.error : null, includeMedia ? visibleMedia?.error : null].filter(Boolean).join(' ') || null;
  return { items, retry, loadMore, error, mediaFacets: visibleMedia?.facets,
    loading: Boolean(workspaceId && (((includeStories || includeTimelines) && (!visibleDocuments || visibleDocuments.loading))
      || (includeMedia && (!visibleMedia || visibleMedia.loading)))),
    hasMore: Boolean(workspaceId && includeMedia && visibleMedia?.cursor && !visibleMedia.loading),
    loadingMore: Boolean(workspaceId && includeMedia && visibleMedia?.loadingMore) };
}
