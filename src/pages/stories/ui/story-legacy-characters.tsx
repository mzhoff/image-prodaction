'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffectEvent, useEffect, useState } from 'react';
import { loadHomeSubjects, type HomeSubjectChoice } from '@/features/chat-assistant/api/home-subject-api';

/** Older stories linked Library profiles directly. Copy them only when the author chooses to edit. */
export function StoryLegacyCharacters({ workspaceId, subjectIds, disabled, onImport }: {
  workspaceId: string; subjectIds: string[]; disabled: boolean; onImport: (id: string) => void;
}) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const [subjects, setSubjects] = useState<HomeSubjectChoice[]>([]), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void loadHomeSubjects(workspaceId, controller.signal).then(setSubjects).catch(() => {
      if (!controller.signal.aborted) setError(tEffect("Прикреплённые герои доступны через «Из Library»."));
    });
    return () => controller.abort();
  }, [workspaceId]);
  return <section className="story-legacy-characters"><p>{tUi("Ранее прикреплены к истории. Откройте героя, чтобы доработать его здесь.")}</p>
    {error ? <p role="status">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p> : null}
    <div className="story-character-cards">{subjects.filter((subject) => subjectIds.includes(subject.id)).map((subject) =>
      <button type="button" className="story-character-card" key={subject.id} disabled={disabled} onClick={() => onImport(subject.id)}>
        {subject.imageAssetIds[0] ? <span className="story-character-cover"><img src={`/api/assets/${subject.imageAssetIds[0]}/content?variant=thumbnail`} alt={subject.name} draggable={false} /></span> : null}
        <strong>{subject.name}</strong><small>{tUi("Открыть паспорт")}</small>
      </button>)}</div>
  </section>;
}
