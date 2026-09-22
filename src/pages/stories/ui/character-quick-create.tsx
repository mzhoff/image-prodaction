'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useState } from 'react';
import { UserRound, X } from '@prodactionpro/ui-core/icons';
import { CHARACTER_CHOICES } from '@/modules/story-projects/core/character-passport';
import type { CharacterPassport } from '@/modules/story-projects/contracts/story-character';

export function CharacterQuickCreate({ busy, onCreate, onClose }: { busy: boolean; onCreate: (passport: CharacterPassport) => Promise<boolean>; onClose: () => void }) {
  const tUi = useTranslations();
  const ui_CHARACTER_CHOICES = useUiCatalog(CHARACTER_CHOICES, tUi);
  const [name, setName] = useState(''), [idea, setIdea] = useState('');
  const [kind, setKind] = useState<CharacterPassport['kind']>('fantasy');
  return <form className="character-quick-create" aria-label={tUi("Свой герой")} onSubmit={(event) => {
    event.preventDefault(); if (!name.trim() || !idea.trim() || busy) return;
    void onCreate({ version: 1, name: name.trim(), identity: idea.trim(), kind, role: 'lead', temperament: [],
      silhouette: 'story', palette: 'story', rendering: 'story', details: '', traits: [], constraints: '' }).then((saved) => { if (saved) onClose(); });
  }}><header><span><UserRound size={17} />{tUi("Свой герой")}</span><button type="button" disabled={busy} aria-label={tUi("Закрыть создание героя")} onClick={onClose}><X size={16} /></button></header>
    <input autoFocus aria-label={tUi("Имя нового героя")} placeholder={tUi("Как его зовут?")} maxLength={120} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} />
    <div className="character-choice-list" role="group" aria-label={tUi("Тип нового героя")}>{Object.entries(ui_CHARACTER_CHOICES.kind).map(([key, label]) => <button type="button" key={key} aria-pressed={kind === key} disabled={busy} onClick={() => setKind(key as CharacterPassport['kind'])}>{label}</button>)}</div>
    <textarea aria-label={tUi("Идея нового героя")} placeholder={tUi("В двух словах: кто он и чего хочет? Например, бумажный кораблик, который ищет друга.")} rows={3} maxLength={3000} value={idea} disabled={busy} onChange={(event) => setIdea(event.target.value)} />
    <footer><span>{tUi("Внешность выберем карточками на следующем шаге")}</span><button type="submit" className="story-primary" disabled={busy || !name.trim() || !idea.trim()}>{tUi("Создать героя")}</button></footer>
  </form>;
}
