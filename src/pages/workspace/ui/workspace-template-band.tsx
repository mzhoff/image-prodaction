'use client';

export type TemplateTab = 'templates' | 'tutorials';

const templateCards = [
  { image: '/workspace-assets/template-01.png', title: 'Change face' },
  { image: '/workspace-assets/template-02.png', title: 'Change Clothes' },
  { image: '/workspace-assets/template-03.png', title: 'Change Face Node' },
  { image: '/workspace-assets/template-04.png', title: 'Change subscriber' },
  { image: '/workspace-assets/template-05.png', title: 'Change audio' },
  { image: '/workspace-assets/template-06.png', title: 'Change Models' },
  { image: '/workspace-assets/template-07.png', title: 'Change Machine' },
  { image: '/workspace-assets/template-08.png', title: 'Change face' },
];

const tutorialCards = [
  { image: '/workspace-assets/template-03.png', title: 'Build a content pipeline' },
  { image: '/workspace-assets/template-06.png', title: 'Connect AI models' },
  { image: '/workspace-assets/template-02.png', title: 'Prepare batch inputs' },
  { image: '/workspace-assets/template-07.png', title: 'Publish final assets' },
];

export function WorkspaceTemplateBand({
  activeTab,
  onTabChange,
}: {
  activeTab: TemplateTab;
  onTabChange: (tab: TemplateTab) => void;
}) {
  const cards = activeTab === 'templates' ? templateCards : tutorialCards;
  return (
    <section className="workspace-template-band" aria-label="Templates">
      <div className="workspace-template-tabs">
        <TemplateTabButton active={activeTab === 'templates'} label="Templates" onClick={() => onTabChange('templates')} />
        <TemplateTabButton active={activeTab === 'tutorials'} label="Tutorials" onClick={() => onTabChange('tutorials')} />
      </div>
      <div className="workspace-template-list">
        {cards.map((card) => <button className="workspace-template-card" key={`${card.image}-${card.title}`} type="button">
          <img src={card.image} alt="" />
          <span>{card.title}</span>
        </button>)}
      </div>
    </section>
  );
}

function TemplateTabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button
    aria-selected={active}
    className={`workspace-template-tab ${active ? 'workspace-template-tab-active' : ''}`}
    onClick={onClick}
    role="tab"
    type="button"
  >{label}</button>;
}
