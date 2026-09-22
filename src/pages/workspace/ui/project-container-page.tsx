'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';
import { StoryDocumentCard } from '@/pages/stories/ui/story-document-card';
import { ProjectChatsPanel } from './production-chats-page';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ProductionEmptyState } from '@/shared/ui/production-empty-state';
import { ArrowLeft, Film, Folder, Grid2X2, List, Route, Search, PanelsTopLeft } from '@prodactionpro/ui-core/icons';
import { useWorkspaceShell } from './workspace-shell-context';
import { ProjectFileCard } from './project-file-card';
import { ProjectFileDialog } from './project-file-dialog';
import { useProjectContents } from '../model/use-project-contents';
import { projectFileItems, projectTab, type ProjectTab } from '../model/project-container-items';
import styles from './project-container.module.css';

export function ProjectContainerPage({ folderId }: { folderId: string }) {
  const tUi = useTranslations();
  const workspace = useWorkspaceShell();
  const folder = workspace.folders.find((item) => item.id === folderId && item.workspaceId === workspace.activeWorkspace?.id);
  if (!workspace.hydrated) return <div className={styles.state} role="status">{tUi("Загружаем проект…")}</div>;
  if (!folder) return <div className={styles.state}><h1>{tUi("Проект недоступен")}</h1>
    <p>{tUi("Выберите проект в текущем Workspace или переключите Workspace в меню профиля.")}</p><Link href="/folders">{tUi("Все проекты")}</Link></div>;
  return <ProjectContainer key={`${folder.workspaceId}:${folder.id}`} folderId={folder.id} workspaceId={folder.workspaceId} name={folder.name} />;
}

function ProjectContainer({ folderId, workspaceId, name }: { folderId: string; workspaceId: string; name: string }) {
  const tUi = useTranslations();
  const ui_tabs = useUiCatalog(tabs, tUi);
  const workspace = useWorkspaceShell();
  const params = useSearchParams();
  const tab = projectTab(params?.get('type'));
  const search = params?.get('q') ?? '';
  const list = params?.get('view') === 'list';
  const data = useProjectContents(workspaceId, folderId, search);
  const [dialog, setDialog] = useState<'flow' | 'story' | 'timeline' | 'existing' | null>(null);
  const files = projectFileItems({ workspaceId, folderId, flows: workspace.projects,
    stories: data.contents.stories, timelines: data.contents.timelines, media: data.contents.media, tab, search });
  const flows = workspace.projects.filter((item) => item.workspaceId === workspaceId && item.folderId === folderId && item.status === 'active');
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const flowCount = flows.filter((item) => item.name.toLocaleLowerCase().includes(normalizedSearch)).length;
  const storyCount = data.contents.stories.filter((item) => item.name.toLocaleLowerCase().includes(normalizedSearch)).length;
  const timelineCount = data.contents.timelines.filter((item) => item.name.toLocaleLowerCase().includes(normalizedSearch)).length;
  const counts = { all: flowCount + storyCount + timelineCount + data.contents.mediaTotal, flows: flowCount,
    stories: storyCount, timeline: timelineCount, media: data.contents.mediaTotal };
  const changeFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params?.toString());
    if (value) next.set(key, value); else next.delete(key);
    window.history.replaceState(null, '', `/folders/${folderId}${next.size ? `?${next}` : ''}`);
  };
  return <>
    <header className={`workspace-header ${styles.header}`}>
      <div><Link href="/folders"><ArrowLeft size={14} />{tUi("Проекты")}</Link><h1>{name}</h1></div>
      <Link className="studio-button" href={`/library?folderId=${folderId}`}>{tUi("Открыть Library")}</Link>
    </header>
    <div className={`workspace-content ${styles.content}`}>
      <ProjectChatsPanel folderId={folderId} />
      <div className={styles.createBar}>
        <Link href={`/create?type=flow&folderId=${folderId}`}><Route size={17} />{tUi("Создать Flow")}</Link>
        <Link href={`/create?type=storyboard&folderId=${folderId}`}><PanelsTopLeft size={17} />Storyboard</Link>
        <Link href={`/create?type=timeline&folderId=${folderId}`}><Film size={17} />Timeline</Link>
        <button type="button" onClick={() => setDialog('existing')}><Folder size={17} />{tUi("Добавить файл")}</button>
      </div>
      <section className={styles.toolbar} aria-label={tUi("Фильтры файлов проекта")}>
        <nav className={styles.tabs} aria-label={tUi("Типы файлов")}>
          {ui_tabs.map((item) => <button type="button" key={item.id} aria-pressed={tab === item.id}
            onClick={() => changeFilter('type', item.id === 'all' ? '' : item.id)}>{item.label}<small>{data.loading ? '…' : counts[item.id]}</small></button>)}
        </nav>
        <div className={styles.tools}>
          <label className={styles.search}><Search size={16} /><input type="search" aria-label={tUi("Поиск в проекте")} placeholder={tUi("Найти в проекте")}
            value={search} onChange={(event) => changeFilter('q', event.target.value)} /></label>
          <div className={styles.views} role="group" aria-label={tUi("Вид файлов")}>
            <button type="button" aria-label={tUi("Карточки")} aria-pressed={!list} onClick={() => changeFilter('view', '')}><Grid2X2 size={16} /></button>
            <button type="button" aria-label={tUi("Список")} aria-pressed={list} onClick={() => changeFilter('view', 'list')}><List size={16} /></button>
          </div>
        </div>
      </section>
      {tab === 'stories' || tab === 'timeline' ? <p className={styles.hint}>{tab === 'timeline' ? tUi("Самостоятельные монтажи. Связь с раскадровкой можно добавить в настройках.") : tUi("Blueprint, сцены и кадры — в каждой раскадровке.")}</p> : null}
      {tab === 'media' ? <p className={styles.hint}>{tUi("Материалы из Flows и историй этого проекта собираются здесь автоматически.")}</p> : null}
      {data.error ? <div className={styles.state} role="alert"><p>{typeof (data.error) === 'string' ? tUi((data.error) as string) : (data.error)}</p><button type="button" onClick={data.refresh}>{tUi("Повторить")}</button></div> : null}
      {data.loading ? <div className={styles.state} role="status">{tUi("Загружаем файлы и материалы…")}</div> : <>
        <div className={`${styles.grid} ${list ? styles.list : ''}`}>
          {files.map((item) => { const record = item.kind === 'story' ? data.contents.stories.find((story) => story.id === item.id) : item.kind === 'timeline' ? data.contents.timelines.find((timeline) => timeline.id === item.id) : undefined; return record ? <StoryDocumentCard key={`${item.kind}:${item.id}`} document={record} kind={item.kind === 'story' ? 'storyboard' : 'timeline'} onChanged={data.refresh} /> : <ProjectFileCard key={`${item.kind}:${item.id}`} item={item} />; })}
        </div>
        {!files.length && !data.error ? <ProductionEmptyState kind={tab === 'all' ? 'projects' : tab === 'stories' ? 'storyboard' : tab === 'media' ? 'library' : tab}
          title={search ? tUi("Файлы не найдены") : tab === 'all' ? tUi("У проекта пока нет файлов") : undefined}
          description={search ? tUi("Попробуйте другое название или выберите другой тип файла.") : tab === 'all' ? tUi("Создайте первый документ или добавьте существующий файл.") : tab === 'media' ? tUi("Материалы из Flows и историй этого проекта появятся здесь.") : undefined}
          action={search ? { label: tUi("Сбросить поиск"), onClick: () => changeFilter('q', '') } : tab === 'all' || tab === 'media' ? { label: tUi("Добавить файл"), onClick: () => setDialog('existing') }
            : { label: tab === 'flows' ? tUi("Создать Flow") : tab === 'stories' ? tUi("Создать Storyboard") : tUi("Создать Timeline"), href: `/create?type=${tab === 'flows' ? 'flow' : tab === 'stories' ? 'storyboard' : 'timeline'}&folderId=${folderId}` }} /> : null}
        {data.contents.nextCursor && (tab === 'all' || tab === 'media') ? <button type="button" className={styles.loadMore} disabled={data.loadingMore}
          onClick={() => void data.loadMore()}>{data.loadingMore ? tUi("Загружаем…") : tUi("Показать ещё материалы")}</button> : null}
      </>}
    </div>
    {dialog ? <ProjectFileDialog folderId={folderId} mode={dialog} onClose={() => setDialog(null)} onChanged={data.refresh} /> : null}
  </>;
}

const tabs: { id: ProjectTab; label: string }[] = [
  { id: 'all', label: 'Все' }, { id: 'flows', label: 'Flows' }, { id: 'stories', label: 'Storyboard' },
  { id: 'timeline', label: 'Timeline' }, { id: 'media', label: 'Медиа' },
];
