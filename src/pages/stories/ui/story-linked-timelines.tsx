'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useEffectEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { StoryProject } from '@/modules/story-projects/contracts/story-project';
import type { TimelineSummary } from '@/modules/story-projects/contracts/story-timeline';
import { creationUrl } from '@/pages/create/model/create-draft';
import { ProductionEmptyState } from '@/shared/ui/production-empty-state';
import { loadTimelines } from '../model/timeline-api';
import { StoryDocumentCard } from './story-document-card';
export function StoryLinkedTimelines({ story }: { story: StoryProject }) {
  const tUi = useTranslations();
  const tEffect = useEffectEvent(tUi);
  const router = useRouter();
  const [items, setItems] = useState<TimelineSummary[]>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => { const controller = new AbortController(); setLoading(true); loadTimelines(story.workspaceId, controller.signal).then(({ timelines }) => { if (!controller.signal.aborted) { setItems(timelines.filter((item) => item.storyboardId === story.id)); setError(''); } }).catch(() => { if (!controller.signal.aborted) setError(tEffect("Не удалось загрузить монтажи.")); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [story.id, story.workspaceId, version]);
  return <div className="story-linked-timelines"><header className="story-heading"><div><h2>{tUi("Монтажи этой истории")}</h2><p>{tUi("Каждый Timeline — отдельный документ. Создавайте разные версии, сохраняя раскадровку.")}</p></div><button className="story-primary" onClick={() => router.push(creationUrl('timeline', { folderId: story.folderId, storyboardId: story.id }))}>{tUi("＋ Новый Timeline")}</button></header>{loading ? <p role="status">{tUi("Загружаем монтажи…")}</p> : error ? <p role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)}<button onClick={() => setVersion((value) => value + 1)}>{tUi("Повторить")}</button></p> : <div className="workspace-project-grid">{items.map((item) => <StoryDocumentCard document={item} kind="timeline" key={item.id} onChanged={() => setVersion((value) => value + 1)} />)}{!items.length ? <ProductionEmptyState kind="timeline" description={tUi("Создайте монтаж этой истории и перенесите в него готовые кадры.")}
    action={{ label: tUi("Создать Timeline"), href: creationUrl('timeline', { folderId: story.folderId, storyboardId: story.id }) }} /> : null}</div>}
  </div>;
}
