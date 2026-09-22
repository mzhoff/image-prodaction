'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useState } from 'react';
import { ArrowUpRight } from '@prodactionpro/ui-core/icons';
import { learningCards, type LearningCard, type TemplateTab } from '../model/workspace-learning-catalog';
import { WorkspaceLearningGallery } from './workspace-learning-gallery';

export type { TemplateTab } from '../model/workspace-learning-catalog';

export function WorkspaceTemplateBand({ open, activeTab, onTabChange }: {
  open: boolean; activeTab: TemplateTab; onTabChange: (tab: TemplateTab) => void;
}) {
  const tUi = useTranslations();
  const ui_learningCards = useUiCatalog(learningCards, tUi);
  const [selected, setSelected] = useState<LearningCard | null>(null);
  const cards = ui_learningCards.filter((card) => card.kind === activeTab);
  return <>
    <div id="flows-learning" className="workspace-learning-collapse" data-open={open} inert={!open} aria-hidden={!open}>
      <div className="workspace-learning-collapse-inner">
        <section className="workspace-learning-band" aria-label={tUi("Туториалы и шаблоны")}>
          <div className="workspace-learning-tabs" role="group" aria-label={tUi("Материалы для старта")}>
            <button type="button" aria-pressed={activeTab === 'tutorials'} onClick={() => onTabChange('tutorials')}>{tUi("Туториалы")}</button>
            <button type="button" aria-pressed={activeTab === 'templates'} onClick={() => onTabChange('templates')}>{tUi("Шаблоны")}</button>
          </div>
          <div className="workspace-learning-cards">
            {cards.map((card) => <button className="workspace-learning-card" type="button" key={card.id} onClick={() => setSelected(card)}>
              <span className="workspace-learning-art"><img src={card.image} alt="" draggable={false} /><ArrowUpRight size={17} /></span>
              <strong>{card.title}</strong><span className="workspace-learning-description">{card.description}</span>
            </button>)}
          </div>
        </section>
      </div>
    </div>
    {selected ? <WorkspaceLearningGallery initialCard={selected} onClose={() => setSelected(null)} /> : null}
  </>;
}
