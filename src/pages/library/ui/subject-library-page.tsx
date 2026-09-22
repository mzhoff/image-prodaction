'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Input as PuiInput } from '@prodactionpro/ui-core/input';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Plus, Search, UserRound } from '@prodactionpro/ui-core/icons';
import { useWorkspaceShell } from '@/pages/workspace/ui/workspace-shell-context';
import { useSubjectLibrary } from '@/entities/production-graph/api/use-subject-library';
import { getRemoteAssetContentUrl } from '@/entities/production-graph/lib/remote-asset';
import { ProductionSectionLayout } from '@/shared/ui/production-section-layout';
import { ProductionEmptyState } from '@/shared/ui/production-empty-state';
import { SubjectLibraryEditor } from './subject-library-editor';

export function SubjectLibraryPage({ navigation }: { navigation?: ReactNode }) {
  const tUi = useTranslations();
  const { activeWorkspace } = useWorkspaceShell();
  const library = useSubjectLibrary(activeWorkspace?.id);
  const { reload } = library;
  const params = useSearchParams();
  const selectedId = params?.get('subject');
  const [search, setSearch] = useState('');
  useEffect(() => { void reload(); }, [reload]);
  if (selectedId && activeWorkspace) return <SubjectLibraryEditor key={`${activeWorkspace.id}:${selectedId}`}
    workspaceId={activeWorkspace.id} subjectId={selectedId} navigation={navigation} />;
  const subjects = library.subjects.filter((subject) => subject.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <ProductionSectionLayout title="Library" className="library-section" navigation={navigation}
    actions={<Link className="workspace-create-button" href="/library?section=subjects&subject=new"><Plus size={16} />{tUi("Создать персонажа")}</Link>}
    controls={<label className="workspace-search"><Search size={16} /><PuiInput type="search" value={search}
      aria-label={tUi("Поиск персонажей")} placeholder={tUi("Найти персонажа")} onChange={(event) => setSearch(event.target.value)} /></label>}>
    <div className="studio-organize-content">
      <p className="studio-hint">{tUi("Общие паспорта для формы и Subject Builder. Имя, внешность, постоянные и изменяемые признаки, референсы.")}</p>
      {library.loading ? <p role="status">{tUi("Загружаем персонажей…")}</p> : null}
      {library.error ? <p role="alert">{typeof (library.error) === 'string' ? tUi((library.error) as string) : (library.error)} <button className="studio-button" onClick={() => void library.reload()}>{tUi("Повторить")}</button></p> : null}
      <div className="studio-subject-grid">
        {subjects.map((subject) => <Link className="studio-subject-card" key={subject.id} href={`/library?section=subjects&subject=${subject.id}`} draggable={false}>
          <div className="studio-subject-cover">{subject.imageAssetIds[0]
            // Authenticated asset variants are already prepared by the upload service.
            ? <img src={getRemoteAssetContentUrl(subject.imageAssetIds[0], 'thumbnail')} alt="" loading="lazy" draggable={false} /> : <UserRound size={44} />}</div>
          <strong>{subject.name}</strong><p>{subject.identitySummary || tUi("Паспорт персонажа")}</p>
        </Link>)}
      </div>
      {!library.loading && !library.error && subjects.length === 0 ? <ProductionEmptyState kind="library" title={search ? tUi("Персонажи не найдены") : tUi("Познакомимся с вашим героем")}
        description={search ? tUi("Попробуйте другое имя или уберите поисковый запрос.") : tUi("Сохраните внешность и референсы персонажа, чтобы возвращаться к нему в новых работах.")}
        action={search ? { label: tUi("Сбросить поиск"), onClick: () => setSearch('') } : { label: tUi("Создать персонажа"), href: '/library?section=subjects&subject=new' }} /> : null}
    </div>
  </ProductionSectionLayout>;
}
