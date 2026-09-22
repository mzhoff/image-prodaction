'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffectEvent, useEffect, useState } from 'react';
import { Film, Plus, Search } from '@prodactionpro/ui-core/icons';
import type { StorySummary } from '@/modules/story-projects/contracts/story-project';
import type { TimelineSummary } from '@/modules/story-projects/contracts/story-timeline';
import { useWorkspaceShell } from '@/pages/workspace/ui/workspace-shell-context';
import { ProjectFolderCard } from '@/pages/workspace/ui/project-folder-card';
import { FilterSelect } from '@/shared/ui/filter-select';
import { ProductionSectionLayout } from '@/shared/ui/production-section-layout';
import { ProductionEmptyState } from '@/shared/ui/production-empty-state';
import { loadStories } from '../model/story-api';
import { loadTimelines } from '../model/timeline-api';
import { creationUrl } from '@/pages/create/model/create-draft';
import { StoryDocumentCard } from './story-document-card';

export function StoriesPage() {
  const tUi = useTranslations();
  const workspace = useWorkspaceShell(); const id = workspace.activeWorkspace?.id;
  if (!workspace.hydrated) return <ProductionSectionLayout title="Stories"><p role="status">{tUi("Загружаем Workspace…")}</p></ProductionSectionLayout>;
  if (!id) return <ProductionSectionLayout title="Stories"><p role="alert">{workspace.error || tUi("Для историй нужен Workspace.")}</p></ProductionSectionLayout>;
  return <StoriesList key={id} workspaceId={id} />;
}
function StoriesList({ workspaceId }: { workspaceId: string }) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const workspace = useWorkspaceShell(); const router = useRouter(); const params = useSearchParams();
  const type = params?.get('view') === 'timeline' ? 'timeline' : params?.get('view') === 'storyboard' ? 'storyboard' : 'all';
  const [stories, setStories] = useState<StorySummary[]>([]); const [timelines, setTimelines] = useState<TimelineSummary[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState(''); const [folderId, setFolderId] = useState('all');
  useEffect(() => { const controller = new AbortController(); setLoading(true);
    Promise.all([loadStories(workspaceId, controller.signal), loadTimelines(workspaceId, controller.signal)]).then(([a, b]) => { if (!controller.signal.aborted) { setStories(a.stories); setTimelines(b.timelines); setError(''); } })
      .catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : tEffect("Не удалось загрузить документы.")); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [workspaceId, retry]);
  const startCreation = (kind: 'storyboard' | 'timeline') => router.push(creationUrl(kind, { folderId: folderId === 'all' ? null : folderId }));
  const folders = workspace.folders.filter((folder) => folder.workspaceId === workspaceId);
  const documents = [...stories.map((document) => ({ document, kind: 'storyboard' as const })), ...timelines.map((document) => ({ document, kind: 'timeline' as const }))]
    .filter(({ document, kind }) => (type === 'all' || kind === type) && document.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) && (folderId === 'all' || (document.folderId ?? '') === folderId)).sort((a, b) => b.document.updatedAt.localeCompare(a.document.updatedAt));
  return <ProductionSectionLayout title="Stories" className="stories-page story-library-page"
    actions={<div className="story-library-create">
      <button type="button" onClick={() => startCreation('timeline')}><Film size={16} />{tUi("Новый Timeline")}</button>
      <button type="button" className="workspace-create-button" onClick={() => startCreation('storyboard')}><Plus size={16} />{tUi("Новая история")}</button>
    </div>}
    navigation={<nav className="production-section-navigation" aria-label={tUi("Тип документов Stories")}>
      {[{ id: 'all', label: tUi("Все документы"), count: stories.length + timelines.length }, { id: 'storyboard', label: 'Storyboard', count: stories.length }, { id: 'timeline', label: 'Timeline', count: timelines.length }].map((item) => (
        <Link key={item.id} aria-current={type === item.id ? 'page' : undefined} href={item.id === 'all' ? '/stories' : `/stories?view=${item.id}`}>{item.label}<small>{item.count}</small></Link>
      ))}
    </nav>}
    controls={<div className="story-library-tools">
      <label><Search size={15} /><input type="search" aria-label={tUi("Поиск документов")} placeholder={tUi("Найти документ")} value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      <FilterSelect label={tUi("Проект")} defaultValue="all" value={folderId} options={[{ value: 'all', label: tUi("Все проекты") }, { value: '', label: tUi("Без папки") }, ...folders.map((folder) => ({ value: folder.id, label: folder.name }))]} onChange={setFolderId} />
    </div>}>
    {folders.length && folderId === 'all' && !query ? <section className="story-library-folders"><div className="story-section-heading"><h2>{tUi("Проекты")}</h2><Link href="/folders">{tUi("Все проекты ↗")}</Link></div><div className="story-folder-row">{folders.map((folder) => <ProjectFolderCard key={folder.id} folder={folder} description={tUi("{p1} документов Stories", { p1: stories.filter((item) => item.folderId === folder.id).length + timelines.filter((item) => item.folderId === folder.id).length })} />)}</div></section> : null}
    {error ? <div role="alert" className="story-error">{typeof (error) === 'string' ? tUi((error) as string) : (error)}<button onClick={() => setRetry((value) => value + 1)}>{tUi("Повторить")}</button></div> : null}
    {loading ? <p role="status">{tUi("Открываем вашу студию…")}</p> : <div className="workspace-project-grid story-documents-grid">{documents.map(({ document, kind }) => <StoryDocumentCard key={`${kind}:${document.id}`} document={document} kind={kind} onChanged={() => setRetry((value) => value + 1)} />)}</div>}
    {!loading && !error && !documents.length ? <ProductionEmptyState kind={type === 'all' ? 'stories' : type}
      title={query || folderId !== 'all' ? tUi("Здесь ничего не нашлось") : undefined}
      description={query || folderId !== 'all' ? tUi("Попробуйте другое название или покажите документы всех проектов.") : undefined}
      action={query || folderId !== 'all' ? { label: tUi("Сбросить фильтры"), onClick: () => { setQuery(''); setFolderId('all'); } }
        : { label: type === 'timeline' ? tUi("Создать Timeline") : tUi("Создать Storyboard"), onClick: () => startCreation(type === 'timeline' ? 'timeline' : 'storyboard') }}
      secondaryAction={type === 'all' && !query && folderId === 'all' ? { label: tUi("Создать Timeline"), onClick: () => startCreation('timeline') } : undefined} /> : null}

  </ProductionSectionLayout>;
}
