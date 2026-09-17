'use client';

import { Input as PuiInput } from '@prodactionpro/ui-core/input';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { FileText, Folder, Pencil, Plus, Route, Search, Star } from '@prodactionpro/ui-core/icons';
import { useWorkspaceShell } from './workspace-shell-context';

export function StudioFoldersPage({ library = false }: { library?: boolean }) {
  const workspace = useWorkspaceShell();
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const list = params?.get('view') === 'list';
  const folders = workspace.folders.filter((folder) => folder.workspaceId === workspace.activeWorkspace?.id
    && folder.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const setList = (value: boolean) => {
    const next = new URLSearchParams(params?.toString());
    if (value) next.set('view', 'list'); else next.delete('view');
    router.replace(`${library ? '/library' : '/'}?${next}`, { scroll: false });
  };
  return <>
    <header className="workspace-header"><h1>{library ? 'Библиотека · По проектам' : 'Проекты'}</h1></header>
    <div className="workspace-content studio-organize-content">
      <div className="workspace-files-header">
        <div className="workspace-files-primary-actions">
          <button className="workspace-create-button" type="button" disabled={!workspace.activeWorkspace}
            onClick={() => { setEditing('new'); setName(''); setError(''); }}><Plus size={16} />Create New</button>
          <Link className="workspace-filter-button" href="/"><FileText size={15} />Files</Link>
          <Link className="workspace-filter-button" href="/?favorites=1"><Star size={15} />Favorites</Link>
          <Link className="workspace-filter-button" href="/?executable=1"><Route size={15} />Executable</Link>
        </div>
        <div className="workspace-files-actions">
          <label className="workspace-search"><Search size={16} /><PuiInput type="search" aria-label="Поиск проектов" placeholder="Найти проект" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <div className="workspace-view-toggle">
            <button className="studio-button" type="button" aria-pressed={!list} onClick={() => setList(false)}>Карточки</button>
            <button className="studio-button" type="button" aria-pressed={list} onClick={() => setList(true)}>Список</button>
          </div>
        </div>
      </div>
      <p className="studio-hint">{library ? 'Изображения всех канвасов проекта собираются вместе автоматически.' : 'Соберите связанные канвасы и пайплайны в одну папку. Файлы без проекта остаются в My Files.'}</p>
      {editing ? <form className="studio-inline-form" onSubmit={async (event) => {
        event.preventDefault(); if (busy) return; setBusy(true); setError('');
        try { await workspace.saveFolder(name.trim(), editing === 'new' ? undefined : editing); setEditing(null); }
        catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось сохранить проект.'); }
        finally { setBusy(false); }
      }}>
        <PuiInput autoFocus aria-label="Название проекта" maxLength={120} required value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, Content Hub" />
        <button className="studio-button" type="submit" disabled={busy || !name.trim()}>Сохранить</button>
        <button className="studio-button" type="button" disabled={busy} onClick={() => setEditing(null)}>Отмена</button>
      </form> : null}
      {error || workspace.error ? <p role="alert">{error || workspace.error}</p> : null}
      <div className={`studio-folder-grid ${list ? 'studio-folder-list' : ''}`}>
        {folders.map((folder) => {
          const projects = workspace.projects.filter((item) => item.folderId === folder.id && item.status === 'active');
          return <article className="studio-folder-card" key={folder.id}>
          <Link href={`${library ? '/library' : '/'}?folderId=${folder.id}`}>
            <span className="studio-folder-preview" aria-hidden="true">
              {projects.slice(0, 4).map((project) => project.thumbnailAvailable && project.thumbnailUrl
                ? <img key={project.id} src={project.thumbnailUrl} alt="" loading="lazy" />
                : <span key={project.id}><FileText size={18} /></span>)}
              {Array.from({ length: Math.max(0, 4 - projects.length) }, (_, index) => <span key={`empty-${index}`} />)}
            </span>
            <span className="studio-folder-identity">
              <span className="studio-folder-mark">
                {isTokberiFolder(folder.name) ? <img src="/workspace-assets/tokberi-logo.svg" alt="" /> : <Folder size={22} />}
              </span>
              <span><strong>{folder.name}</strong><small>{folder.systemKey === 'content-hub' ? 'Интеграция Content Hub · ' : ''}{projects.length} канвасов</small></span>
            </span>
          </Link>
          {!folder.systemKey ? <button type="button" className="studio-button" aria-label={`Переименовать ${folder.name}`}
            onClick={() => { setEditing(folder.id); setName(folder.name); }}><Pencil size={14} /></button> : null}
        </article>;
        })}
      </div>
      {workspace.hydrated && folders.length === 0 ? <p className="studio-hint">{query ? 'Проекты не найдены.' : 'Пока нет проектов. Создайте первую папку.'}</p> : null}
    </div>
  </>;
}

function isTokberiFolder(name: string) {
  return /^(токбери|tokberi|togberry)$/i.test(name.trim());
}
