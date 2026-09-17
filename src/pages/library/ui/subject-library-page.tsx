'use client';

import { Input as PuiInput } from '@prodactionpro/ui-core/input';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Plus, Search, UserRound } from '@prodactionpro/ui-core/icons';
import { useWorkspaceShell } from '@/pages/workspace/ui/workspace-shell-context';
import { useSubjectLibrary } from '@/entities/production-graph/api/use-subject-library';
import { getRemoteAssetContentUrl } from '@/entities/production-graph/lib/remote-asset';
import { SubjectLibraryEditor } from './subject-library-editor';

export function SubjectLibraryPage() {
  const { activeWorkspace } = useWorkspaceShell();
  const library = useSubjectLibrary(activeWorkspace?.id);
  const { reload } = library;
  const params = useSearchParams();
  const selectedId = params?.get('subject');
  const [search, setSearch] = useState('');
  useEffect(() => { void reload(); }, [reload]);
  if (selectedId && activeWorkspace) return <SubjectLibraryEditor key={`${activeWorkspace.id}:${selectedId}`}
    workspaceId={activeWorkspace.id} subjectId={selectedId} />;
  const subjects = library.subjects.filter((subject) => subject.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <>
    <header className="workspace-header"><h1>Библиотека · Персонажи</h1></header>
    <div className="workspace-content studio-organize-content">
      <div className="workspace-files-header">
        <label className="workspace-search"><Search size={16} /><PuiInput type="search" value={search}
          aria-label="Поиск персонажей" placeholder="Найти персонажа" onChange={(event) => setSearch(event.target.value)} /></label>
        <Link className="workspace-create-button" href="/library?section=subjects&subject=new"><Plus size={16} />Создать персонажа</Link>
      </div>
      <p className="studio-hint">Общие паспорта для формы и Subject Builder. Имя, внешность, постоянные и изменяемые признаки, референсы.</p>
      {library.loading ? <p role="status">Загружаем персонажей…</p> : null}
      {library.error ? <p role="alert">{library.error} <button className="studio-button" onClick={() => void library.reload()}>Повторить</button></p> : null}
      <div className="studio-subject-grid">
        {subjects.map((subject) => <Link className="studio-subject-card" key={subject.id} href={`/library?section=subjects&subject=${subject.id}`}>
          <div className="studio-subject-cover">{subject.imageAssetIds[0]
            // Authenticated asset variants are already prepared by the upload service.
            ? <img src={getRemoteAssetContentUrl(subject.imageAssetIds[0], 'thumbnail')} alt="" loading="lazy" /> : <UserRound size={44} />}</div>
          <strong>{subject.name}</strong><p>{subject.identitySummary || 'Паспорт персонажа'}</p>
        </Link>)}
      </div>
      {!library.loading && !library.error && subjects.length === 0 ? <p className="studio-hint">{search ? 'Персонажи не найдены.' : 'Создайте персонажа здесь или сохраните его из Subject Builder.'}</p> : null}
    </div>
  </>;
}
