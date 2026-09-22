'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { useFormatLocale } from '@/shared/i18n/use-format-locale';
import { useEffect, useRef, useState } from 'react';
import type { TimelineLibraryAsset, useTimelineProductionLibrary } from '../model/use-timeline-production-library';
import type { useTimelineScenes } from '../model/use-timeline-scenes';
import { IconButton } from '@prodactionpro/ui-core/icon-button';
import { Upload, RefreshCw, Search, Play, AudioLines, LoaderCircle, Check } from '@prodactionpro/ui-core/icons';
import { timelineAssetName } from '../model/timeline-asset-name';
import libraryStyles from './timeline-library.module.css';
import styles from './timeline-workspace.module.css';

export function TimelineMediaLibrary({ library, scenes, onAdd, onImportScenes }: {
  library: ReturnType<typeof useTimelineProductionLibrary>; scenes: ReturnType<typeof useTimelineScenes>;
 onAdd(asset: TimelineLibraryAsset): void; onImportScenes(): void;
}) {
  const tUi = useTranslations();
  const language = useFormatLocale();
  const input = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState('all'), [query, setQuery] = useState('');
  const [threshold, setThreshold] = useState(10), [chosen, setChosen] = useState('');
  const [dropping, setDropping] = useState(false), dragDepth = useRef(0);
  useEffect(() => { if (library.uploadedBatch) { setFilter('all'); setQuery(''); } }, [library.uploadedBatch]);
  async function upload(files: FileList | File[]) {
    if (library.busy) return;
    const assets = await library.uploadMany(Array.from(files)); if (assets.length) setChosen(assets.at(-1)!.id);
  }
  const uploading = library.uploads.some((item) => ['waiting', 'uploading', 'processing'].includes(item.phase)) && library.busy;
  const selected = library.assets.find((asset) => asset.id === chosen);
  const items = library.assets.filter((asset) => asset.status === 'ready' && (filter === 'all' || asset.mediaKind === filter) && (timelineAssetName(asset, language, tUi) + asset.originalName).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <aside className={libraryStyles.library} aria-label={tUi("Библиотека монтажа")} data-dropping={dropping}
    onDragEnter={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); dragDepth.current++; setDropping(true); } }}
    onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDropping(false); }} onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }} onDrop={(event) => { if (!event.dataTransfer.files.length) return; event.preventDefault(); event.stopPropagation(); dragDepth.current = 0; setDropping(false); void upload(event.dataTransfer.files); }}>
    <header className={libraryStyles.header}><h2>{tUi("Материалы")}</h2><div className={libraryStyles.actions}>
      <IconButton size="xs" icon={<Search />} aria-label={tUi("Поиск в библиотеке")} title={tUi("Поиск в библиотеке")} aria-expanded={searchOpen} onClick={() => { setSearchOpen(!searchOpen); setQuery(''); }} />
      <IconButton size="xs" icon={<Upload />} aria-label={tUi("Импортировать материалы")} title={tUi("Импортировать материалы")} disabled={uploading || library.busy} onClick={() => input.current?.click()} />
      <IconButton size="xs" icon={<RefreshCw />} aria-label={tUi("Обновить библиотеку")} title={tUi("Обновить библиотеку")} disabled={uploading || library.busy} onClick={library.refresh} />
    </div></header>
    <input ref={input} type="file" multiple accept="image/*,video/mp4,video/quicktime,video/webm,audio/*" aria-label={tUi("Загрузить материалы с устройства")} className={styles.fileInput} onChange={(event) => { if (event.target.files) void upload(event.target.files); event.target.value = ''; }} />
    {dropping || uploading ? <div className={libraryStyles.dropPanel} role="status" aria-live="polite">
      <Upload size={28} /><strong>{dropping ? tUi("Отпустите файлы здесь") : tUi("Добавляем материалы")}</strong>
      <p>{tUi("Изображения, видео и звук · можно несколько файлов")}</p>
      {uploading ? <div className={libraryStyles.uploadList}>{library.uploads.map((item, index) => <div key={index} className={libraryStyles.uploadItem}>
        <span>{item.name}</span><small>{item.phase === 'ready' ? <Check size={14} /> : item.phase === 'processing' ? <><LoaderCircle className={libraryStyles.spinner} size={14} />  {' '}{tUi("Обрабатываем")}</> : item.phase === 'uploading' ? `${item.percent}%` : item.phase === 'error' ? tUi("Ошибка") : tUi("В очереди")}</small>
        {item.phase === 'uploading' ? <progress max={100} value={item.percent} aria-label={tUi("Загрузка {p1}", { p1: item.name })} /> : null}
      </div>)}</div> : null}
    </div> : null}
    <div hidden={dropping || uploading} className={libraryStyles.scroll} aria-label={tUi("Содержимое библиотеки")}>
    <p className={styles.hint}>{tUi("Перетащите файлы сюда. На дорожку — перетаскиванием или двойным нажатием на материал.")}</p>
    {searchOpen ? <input autoFocus type="search" aria-label={tUi("Найти материал")} placeholder={tUi("Поиск в библиотеке")} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { setSearchOpen(false); setQuery(''); } }} /> : null}
    <div className={styles.tabs} aria-label={tUi("Тип материалов")}>{[['all', tUi("Все")], ['video', tUi("Видео")], ['image', tUi("Фото")], ['audio', tUi("Аудио")]].map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
    {library.busy ? <p role="status">{tUi("Обновляем материалы…")}</p> : null}
    {library.error ? <p role="alert">{typeof (library.error) === 'string' ? tUi((library.error) as string) : (library.error)}</p> : null}
    <div className={libraryStyles.assets}>{items.map((asset) => { const name = timelineAssetName(asset, language, tUi); return <div key={asset.id} className={libraryStyles.asset} data-selected={chosen === asset.id}>
      <button type="button" className={libraryStyles.select} draggable onDragStart={(event) => event.dataTransfer.setData('application/x-timeline-asset', asset.id)} onClick={() => setChosen(asset.id)} onDoubleClick={() => onAdd(asset)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onAdd(asset); } }} aria-label={tUi("Выбрать {p1}", { p1: name })} title={name}>
        <span className={libraryStyles.thumb}>{asset.mediaKind === 'image' || asset.thumbnailUrl ? <img src={asset.thumbnailUrl || `/api/assets/${asset.id}/content`} alt="" loading="lazy" draggable={false} /> : asset.mediaKind === 'audio' ? <AudioLines size={28} /> : <Play size={28} />}
          {asset.video ? <small>{Math.floor(asset.video.durationSeconds / 60)}:{String(Math.floor(asset.video.durationSeconds % 60)).padStart(2, '0')}</small> : null}</span>
        {asset.mediaKind !== 'image' ? <span className={libraryStyles.name}>{name}</span> : null}
      </button>
    </div>; })}</div>
    {!items.length ? <p className={styles.hint}>{tUi("Загрузите файлы или выберите другой фильтр.")}</p> : null}
    {library.cursor ? <button type="button" disabled={library.busy} onClick={library.more}>{tUi("Ещё материалы")}</button> : null}
    {selected?.mediaKind === 'video' ? <section className={styles.sceneTools}><strong>{tUi("Разбить на сцены")}</strong><p className={styles.hint}>{timelineAssetName(selected, language, tUi)}  {' '}{tUi("· до 5 минут. Исходник остаётся целым.")}</p>
      <label>{tUi("Чувствительность к склейкам")}<input aria-label={tUi("Порог смены сцены")} type="range" min={1} max={60} value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /></label>
      <small>{tUi("Меньше порог — больше фрагментов ·")}{' '} {threshold}</small><button type="button" disabled={scenes.busy} onClick={() => scenes.analyze(selected.id, threshold)}>{tUi("Найти сцены")}</button></section> : null}
    {scenes.status ? <p role="status">{scenes.status}</p> : null}
    {scenes.busy ? <button type="button" onClick={scenes.cancel}>{tUi("Остановить разбиение")}</button> : null}
    {scenes.result ? <div className={styles.sceneTools}><button type="button" className="story-primary" onClick={onImportScenes}>{tUi("Добавить найденные сцены")}</button><button type="button" onClick={scenes.clear}>{tUi("Скрыть результат")}</button></div> : null}
    {scenes.error ? <p role="alert">{typeof (scenes.error) === 'string' ? tUi((scenes.error) as string) : (scenes.error)}</p> : null}
    </div>
  </aside>;
}
