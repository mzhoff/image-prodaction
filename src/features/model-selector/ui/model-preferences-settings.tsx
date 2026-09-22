'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';
import { ArrowDown, ArrowUp } from '@prodactionpro/ui-core/icons';
import { useState } from 'react';
import { useOpenRouterModels } from '@/shared/api/use-openrouter-models';
import { getVideoModelDisplayName } from '@/shared/media/video-generation-contracts';
import { MODEL_MODALITIES, selectModels, type ModelModality } from '@/shared/model-preferences/contracts';
import type { DarkSelectOption } from '@/shared/ui/dark-select';
import { useVideoModels } from '@/features/graph-node/model/use-video-models';
import { transcriptionModelOptions } from '@/features/graph-node/model/audio-node-options';
import { useModelPreferences } from '../model/use-model-preferences';
import { ImageModelLogo } from './image-model-logo';
import { VideoModelLogo } from './video-model-logo';
import { FavoriteButton } from './favorite-button';

const LABELS: Record<ModelModality, string> = { text: 'Текст', image: 'Изображения', video: 'Видео', audio: 'Аудио' };
export function ModelPreferencesSettings() {
  const tUi = useTranslations();
  const ui_LABELS = useUiCatalog(LABELS, tUi);
  const state = useModelPreferences();
  const catalog = useOpenRouterModels();
  const video = useVideoModels();
  const [modality, setModality] = useState<ModelModality>('text');
  const [query, setQuery] = useState('');
  const preference = state.data.preferences[modality];
  const models: Record<ModelModality, DarkSelectOption[]> = {
    text: catalog.analysisModels.map((item) => ({ value: item.id, label: item.label })),
    image: (catalog.generationModels ?? catalog.imageModels).map((item) => ({ value: item.id, label: item.label })),
    audio: [...catalog.speechModels.map((item) => ({ value: item.id, label: item.label })), ...transcriptionModelOptions('google/gemini-3.1-flash-lite')],
    video: video.models.map((item) => ({ value: item.key, label: getVideoModelDisplayName(item.key, item.label) })),
  };
  const options = models[modality].map((item) => ({ ...item, icon: modality === 'video'
    ? <VideoModelLogo modelKey={item.value} /> : <ImageModelLogo modelId={item.value} /> }));
  const available = selectModels(options, 'all', [], {}, query);
  const byId = new Map(options.map((item) => [item.value, item]));
  const disabled = !state.ready || state.pending;
  function favoriteButton(id: string, label: string) {
    return <FavoriteButton label={label} favorite={preference.favorites.includes(id)} disabled={disabled}
      onClick={() => state.change({ modality, action: 'favorite', modelId: id, favorite: !preference.favorites.includes(id) })} />;
  }
  function move(index: number, direction: number) {
    const favorites = [...preference.favorites];
    [favorites[index], favorites[index + direction]] = [favorites[index + direction], favorites[index]];
    state.change({ modality, action: 'reorder', favorites, expectedRevision: preference.revision });
  }
  return <section className="model-preferences-settings settings-card" aria-labelledby="account-models-title">
    <h3 id="account-models-title">{tUi("Избранные модели")}</h3>
    <p>{tUi("Отметьте модели звёздочкой — они будут под рукой в редакторе.")}</p>
    <div className="model-selector-tabs" role="tablist" aria-label={tUi("Тип моделей")}>
      {MODEL_MODALITIES.map((type) => <button key={type} type="button" role="tab" id={`account-models-${type}`}
        aria-selected={modality === type} aria-controls="account-models-panel" tabIndex={modality === type ? 0 : -1}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
          event.preventDefault(); const index = MODEL_MODALITIES.indexOf(type);
          const next = MODEL_MODALITIES[(index + (event.key === 'ArrowRight' ? 1 : 3)) % 4];
          setModality(next); setQuery(''); document.getElementById(`account-models-${next}`)?.focus();
        }} onClick={() => { setModality(type); setQuery(''); }}>{ui_LABELS[type]}</button>)}
    </div>
    <div id="account-models-panel" role="tabpanel" aria-labelledby={`account-models-${modality}`}>
      {(modality === 'video' && video.error) && <p role="alert">{typeof (video.error) === 'string' ? tUi((video.error) as string) : (video.error)} <button type="button" onClick={video.reload}>{tUi("Обновить каталог")}</button></p>}
      {(modality === 'image' && catalog.imageCatalogError) && <p role="alert">{typeof (catalog.imageCatalogError) === 'string' ? tUi((catalog.imageCatalogError) as string) : (catalog.imageCatalogError)}</p>}
      <div className="model-preferences-columns">
        <div className="model-preferences-column">
          <h4>{tUi("Все модели · A–Z")}</h4>
          <div className="model-selector-search"><input aria-label={tUi("Найти модель в настройках")} placeholder={tUi("Найти модель")} value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          <ul aria-label={tUi("Все модели аккаунта")}>{available.map((item) => <li className="model-preferences-item" key={item.value}>
            <span className="dark-select-option-content">{item.icon}<span title={item.label}>{item.label}</span></span>{favoriteButton(item.value, item.label)}
          </li>)}</ul>
          {!available.length && <p>{query ? tUi("Модели не найдены.") : tUi("Нет доступных моделей.")}</p>}
        </div>
        <div className="model-preferences-column">
          <h4>{tUi("Избранное ·")}{' '} {preference.favorites.length}</h4>
          <ol aria-label={tUi("Порядок избранных моделей")}>{preference.favorites.map((id, index) => {
            const item = byId.get(id); const label = item?.label ?? id;
            return <li className="model-preferences-item" key={id}>
              <span className="dark-select-option-content">{item?.icon}<span title={item ? label : tUi("{p1} — сейчас недоступна", { p1: label })}>{label}{!item && tUi(" · недоступна")}</span></span>
              <button type="button" className="model-preferences-move" aria-label={tUi("Выше: {p1}", { p1: label })} disabled={disabled || index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></button>
              <button type="button" className="model-preferences-move" aria-label={tUi("Ниже: {p1}", { p1: label })} disabled={disabled || index === preference.favorites.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></button>
              {favoriteButton(id, label)}
            </li>;
          })}</ol>
          {!preference.favorites.length && <p>{tUi("Добавьте модели из списка слева.")}</p>}
        </div>
      </div>
      <p className="model-preferences-status" role="status">{state.pending ? tUi("Сохраняем…") : state.loading ? tUi("Загружаем…") : state.ready && !state.error ? tUi("Изменения сохраняются автоматически.") : ''}</p>
      {state.error && <p role="alert">{typeof (state.error) === 'string' ? tUi((state.error) as string) : (state.error)} <button type="button" onClick={() => void state.reload()}>{tUi("Обновить настройки")}</button></p>}
    </div>
  </section>;
}
