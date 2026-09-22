'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useState } from 'react';
import { BookOpen, Video, X } from '@prodactionpro/ui-core/icons';
import { GalleryDialog } from '@/shared/ui/gallery-dialog';
import { learningCards, type LearningCard } from '../model/workspace-learning-catalog';

export function WorkspaceLearningGallery({ initialCard, onClose }: { initialCard: LearningCard; onClose: () => void }) {
  const tUi = useTranslations();
  const ui_learningCards = useUiCatalog(learningCards, tUi);
  const [card, setCard] = useState(initialCard);
  const tutorial = card.kind === 'tutorials';
  return <GalleryDialog label={tutorial ? tUi("Галерея туториалов") : tUi("Галерея шаблонов")} className="workspace-learning-gallery" onClose={onClose}>
    <header className="production-gallery-header">
      <div><h2>{tutorial ? tUi("Туториалы") : tUi("Шаблоны")}</h2><p>Flows</p></div>
      <button type="button" className="production-gallery-close" aria-label={tUi("Закрыть галерею")} onClick={onClose}><X size={18} /></button>
    </header>
    <div className="workspace-learning-gallery-content">
      <div className="workspace-learning-viewer">
        {tutorial && card.videoUrl ? <video key={card.id} src={card.videoUrl} poster={card.image} controls playsInline preload="metadata" />
          : <div className="workspace-learning-pending"><img src={card.image} alt="" draggable={false} />
            <span>{tutorial ? <Video size={18} /> : <BookOpen size={18} />}{tutorial ? tUi("Видеоурок готовится") : tUi("Шаблон готовится")}</span>
          </div>}
        <h3>{card.title}</h3><p>{card.description}</p>
      </div>
      <nav className="workspace-learning-playlist" aria-label={tutorial ? tUi("Другие уроки") : tUi("Другие шаблоны")}>
        {ui_learningCards.filter((item) => item.kind === card.kind).map((item) => <button type="button" key={item.id} aria-pressed={item.id === card.id} onClick={() => setCard(item)}>
          <img src={item.image} alt="" draggable={false} /><span><strong>{item.title}</strong><small>{item.description}</small></span>
        </button>)}
      </nav>
    </div>
  </GalleryDialog>;
}
