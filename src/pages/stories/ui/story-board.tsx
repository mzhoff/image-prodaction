'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useState } from 'react';
import { createUuidV7 } from '@/shared/lib/id';
import type { StoryProject, StoryScene, StoryShot, StorySnapshot } from '@/modules/story-projects/contracts/story-project';
import { removeStoryScene, removeStoryShot } from '@/modules/story-projects/core/story-editing';
import { StoryMediaDialog } from './story-media-browser';
import { ProductionEmptyState } from '@/shared/ui/production-empty-state';

export function StoryBoard({ story, onChange }: { story: StoryProject; onChange: (snapshot: StorySnapshot) => void }) {
  const tUi = useTranslations();
  const { snapshot } = story;
  const [selection, setSelection] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ shotId: string; kind: 'image' | 'video' } | null>(null);
  const scene = snapshot.scenes.find((item) => item.id === selection) ?? snapshot.scenes[0];
  const editScene = (sceneId: string, patch: Partial<StoryScene>) => onChange({ ...snapshot, scenes: snapshot.scenes.map((item) => item.id === sceneId ? { ...item, ...patch } : item) });
  const editShot = (shotId: string, patch: Partial<StoryShot>) => onChange({ ...snapshot, scenes: snapshot.scenes.map((item) => ({ ...item, shots: item.shots.map((shot) => shot.id === shotId ? { ...shot, ...patch } : shot) })) });
  function addScene() { const next = { id: createUuidV7(), title: tUi("Сцена {p1}", { p1: snapshot.scenes.length + 1 }), description: '', shots: [] }; onChange({ ...snapshot, scenes: [...snapshot.scenes, next] }); setSelection(next.id); }
  return <div className="story-board"><div className="story-scenes">
    {!snapshot.scenes.length ? <ProductionEmptyState kind="storyboard" compact title={tUi("Разложим историю на сцены")}
      description={tUi("Начните с первого события. Затем добавьте кадры и материалы.")}
      action={{ label: tUi("Добавить первую сцену"), onClick: addScene }} /> : null}
    {snapshot.scenes.map((item, sceneIndex) => <section className="story-scene" key={item.id} aria-label={item.title} data-selected={item.id === scene?.id}>
      <header><button className="story-scene-select" type="button" aria-pressed={item.id === scene?.id} onClick={() => setSelection(item.id)}><small>{String(sceneIndex + 1).padStart(2, '0')}</small><strong>{item.title}</strong></button>
        <button type="button" aria-label={tUi("Удалить {p1}", { p1: item.title })} onClick={() => { if (window.confirm(tUi("Удалить сцену «{p1}»? Исходные файлы и монтаж сохранятся.", { p1: item.title }))) onChange(removeStoryScene(snapshot, item.id)); }}>×</button></header>
      <div className="story-shot-row">{item.shots.map((shot, index) => <article className="story-shot" key={shot.id}>
        <div className="story-shot-preview" style={{ aspectRatio: snapshot.settings.aspectRatio.replace(':', '/') }}>
          {shot.imageAssetId || shot.videoAssetId ? <ShotPreview key={`${shot.imageAssetId}:${shot.videoAssetId}`} imageId={shot.imageAssetId} videoId={shot.videoAssetId} index={index} /> : <span>{tUi("Добавьте материал")}</span>}
          <small className="story-shot-number">{index + 1}</small></div>
        <div className="story-shot-body"><div className="story-shot-actions"><button type="button" onClick={() => setPicker({ shotId: shot.id, kind: 'image' })}>{shot.imageAssetId ? tUi("Заменить изображение") : tUi("Изображение")}</button><button type="button" onClick={() => setPicker({ shotId: shot.id, kind: 'video' })}>{shot.videoAssetId ? tUi("Заменить видео") : tUi("Видео")}</button></div>
          <textarea rows={4} maxLength={20_000} aria-label={tUi("{p1}, описание кадра {p2}", { p1: item.title, p2: index + 1 })} placeholder={tUi("Что происходит в кадре?")} value={shot.description} onFocus={() => setSelection(item.id)} onChange={(e) => editShot(shot.id, { description: e.target.value })} />
          <div className="story-shot-actions"><label>{tUi("Сек.")}<input aria-label={tUi("Длительность кадра {p1}", { p1: index + 1 })} type="number" min={0.1} max={600} step={0.1} value={shot.durationMs / 1000} onChange={(e) => editShot(shot.id, { durationMs: Math.round(Number(e.target.value) * 1000) })} /></label>
            <button type="button" onClick={() => onChange(removeStoryShot(snapshot, shot.id))}>{tUi("Убрать кадр")}</button></div>
          {shot.imageAssetId || shot.videoAssetId ? <button type="button" className="story-text-button" onClick={() => editShot(shot.id, { imageAssetId: null, videoAssetId: null })}>{tUi("Отвязать медиа")}</button> : null}
        </div>
      </article>)}
        <button type="button" className="story-add-shot" aria-label={tUi("Добавить кадр в {p1}", { p1: item.title })} disabled={item.shots.length >= 100 || snapshot.scenes.reduce((sum, current) => sum + current.shots.length, 0) >= 500} onClick={() => editScene(item.id, { shots: [...item.shots, { id: createUuidV7(), description: '', durationMs: 5000, imageAssetId: null, videoAssetId: null }] })}><span aria-hidden="true">＋</span><small>{tUi("Кадр")}</small></button>
      </div>
    </section>)}
    {snapshot.scenes.length ? <button className="story-add-scene" disabled={snapshot.scenes.length >= 100} onClick={addScene}>{tUi("＋ Добавить сцену")}</button> : null}
  </div>
    {scene ? <aside className="story-scene-inspector story-fields"><small>{tUi("КОНТЕКСТ СЦЕНЫ")}</small><label>{tUi("Название")}<input maxLength={120} value={scene.title} onChange={(e) => editScene(scene.id, { title: e.target.value })} /></label>
      <label>{tUi("Описание сцены")}<textarea rows={12} maxLength={20_000} value={scene.description} onChange={(e) => editScene(scene.id, { description: e.target.value })} placeholder={tUi("Событие, место, герои, атмосфера и звук…")} /></label><p>{tUi("Описание относится ко всей сцене. Детали отдельных планов можно уточнить в карточках кадров.")}</p></aside> : null}
    {picker ? <StoryMediaDialog workspaceId={story.workspaceId} kind={picker.kind} onClose={() => setPicker(null)} onSelect={(asset) => { editShot(picker.shotId, { [picker.kind === 'image' ? 'imageAssetId' : 'videoAssetId']: asset.id }); setPicker(null); }} /> : null}
  </div>;
}

function ShotPreview({ imageId, videoId, index }: { imageId: string | null; videoId: string | null; index: number }) {
  const tUi = useTranslations();
  const [failed, setFailed] = useState(false);
  if (failed) return <span role="alert">{tUi("Материал недоступен. Замените или отвяжите его.")}</span>;
  return imageId ? <img src={`/api/assets/${imageId}/content?variant=thumbnail`} alt={tUi("Кадр {p1}", { p1: index + 1 })} onError={() => setFailed(true)} draggable={false} />
    : <video src={`/api/assets/${videoId}/content`} preload="metadata" controls onError={() => setFailed(true)} />;
}
