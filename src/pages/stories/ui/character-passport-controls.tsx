'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffect, useState } from 'react';
import { Check, Lock, Plus, Unlock } from '@prodactionpro/ui-core/icons';
import type { CharacterPassport, StoryCharacter } from '@/modules/story-projects/contracts/story-character';
import { CHARACTER_CHOICES, characterGenerationPrompt } from '@/modules/story-projects/core/character-passport';

export function CharacterPassportControls({ character, visualStyle, busy, onDirty, onSave }: {
  character: StoryCharacter; visualStyle: string; busy: boolean; onDirty: (dirty: boolean) => void; onSave: (passport: CharacterPassport) => Promise<boolean>;
}) {
  const tUi = useTranslations();
  const ui_CHARACTER_CHOICES = useUiCatalog(CHARACTER_CHOICES, tUi);
  const [passport, setPassport] = useState(character.passport), [tab, setTab] = useState<'look' | 'character' | 'details'>('look');
  const [trait, setTrait] = useState('');
  const dirty = JSON.stringify(passport) !== JSON.stringify(character.passport);
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  const change = <K extends keyof CharacterPassport>(key: K, value: CharacterPassport[K]) => setPassport((current) => ({ ...current, [key]: value }));
  return <div className="character-passport-controls">
    <nav className="character-passport-tabs" aria-label={tUi("Настройки героя")}>{([['look', tUi("Образ")], ['character', tUi("Характер")], ['details', tUi("Детали")]] as const).map(([key, title]) => <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{title}</button>)}</nav>
    <fieldset disabled={busy}>
      {tab === 'look' ? <>
        <ChoiceGroup field="kind" title={tUi("Кто наш герой")} value={passport.kind} onChange={(value) => change('kind', value)} />
        <ChoiceGroup field="rendering" title={tUi("Как его покажем")} value={passport.rendering} onChange={(value) => change('rendering', value)} illustrated />
        <ChoiceGroup field="silhouette" title={tUi("Силуэт")} value={passport.silhouette} onChange={(value) => change('silhouette', value)} illustrated />
        <ChoiceGroup field="palette" title={tUi("Цветовое настроение")} value={passport.palette} onChange={(value) => change('palette', value)} illustrated />
      </> : tab === 'character' ? <>
        <ChoiceGroup field="role" title={tUi("Роль в истории")} value={passport.role} onChange={(value) => change('role', value)} />
        <section className="character-choice-group"><h4>{tUi("Какой он?")}{' '} <small>{tUi("До четырёх черт")}</small></h4><div className="character-choice-list">{Object.entries(ui_CHARACTER_CHOICES.temperament).map(([key, label]) => {
          const value = key as CharacterPassport['temperament'][number], selected = passport.temperament.includes(value);
          return <button type="button" role="checkbox" aria-checked={selected} key={key} disabled={!selected && passport.temperament.length >= 4}
            onClick={() => change('temperament', selected ? passport.temperament.filter((item) => item !== value) : [...passport.temperament, value])}>{selected ? <Check size={13} /> : null}{label}</button>;
        })}</div></section>
        <p className="character-passport-summary">{passport.identity}</p>
        <details className="character-custom"><summary>{tUi("Уточнить имя и замысел")}</summary><label>{tUi("Имя")}<input value={passport.name} maxLength={120} onChange={(event) => change('name', event.target.value)} /></label><label>{tUi("Кто он и чего хочет")}<textarea rows={3} value={passport.identity} maxLength={10000} onChange={(event) => change('identity', event.target.value)} /></label></details>
      </> : <>
        <section className="character-choice-group"><h4>{tUi("Сохраняем в каждом кадре")}</h4><p>{tUi("Закрепите узнаваемые детали. Остальное можно менять.")}</p><div className="character-traits">{passport.traits.map((item, index) => <button type="button" role="checkbox" aria-checked={item.locked} key={`${index}:${item.label}`} onClick={() => change('traits', passport.traits.map((entry, position) => position === index ? { ...entry, locked: !entry.locked } : entry))} title={item.label}>{item.locked ? <Lock size={14} /> : <Unlock size={14} />}<span>{item.label}</span></button>)}</div>
          <form className="character-add-trait" onSubmit={(event) => { event.preventDefault(); if (trait.trim() && passport.traits.length < 12) { change('traits', [...passport.traits, { label: trait.trim(), locked: true }]); setTrait(''); } }}><input aria-label={tUi("Добавить особую примету")} placeholder={tUi("Своя примета: большие уши…")} maxLength={160} value={trait} onChange={(event) => setTrait(event.target.value)} /><button type="submit" aria-label={tUi("Закрепить примету")} disabled={!trait.trim() || passport.traits.length >= 12}><Plus size={16} /></button></form>
        </section>
        <p className="character-passport-summary">{passport.details || tUi("Добавьте особые детали или обсудите их с соавтором.")}</p>
        <details className="character-custom"><summary>{tUi("Добавить свои уточнения")}</summary><label>{tUi("Внешность и одежда")}<textarea rows={3} value={passport.details} maxLength={10000} onChange={(event) => change('details', event.target.value)} /></label><label>{tUi("Чего избегаем")}<textarea rows={2} value={passport.constraints} maxLength={10000} onChange={(event) => change('constraints', event.target.value)} /></label>{passport.notes !== undefined ? <label>{tUi("Контекст героя")}<textarea rows={3} value={passport.notes} maxLength={10000} onChange={(event) => change('notes', event.target.value)} /></label> : null}</details>
      </>}
      <details className="character-prompt-preview"><summary>{tUi("Промпт из выбранного образа")}</summary><p>{tUi("Обновляется вместе с паспортом")}</p><pre>{characterGenerationPrompt(passport, visualStyle)}</pre></details>
      {dirty ? <div className="character-save-bar" role="status"><span>{tUi("Образ изменён")}</span><button type="button" onClick={() => setPassport(character.passport)}>{tUi("Отменить")}</button><button type="button" className="story-primary" disabled={!passport.name.trim() || !passport.identity.trim()} onClick={() => void onSave(passport)}>{tUi("Применить")}</button></div> : null}
    </fieldset>
  </div>;
}

function ChoiceGroup<K extends Exclude<keyof typeof CHARACTER_CHOICES, 'temperament'>>({ field, title, value, onChange, illustrated = false }: {
  field: K; title: string; value: CharacterPassport[K]; onChange: (value: CharacterPassport[K]) => void; illustrated?: boolean;
}) {
  const tUi = useTranslations();
  const ui_CHARACTER_CHOICES = useUiCatalog(CHARACTER_CHOICES, tUi);
  return <section className="character-choice-group"><h4>{title}</h4><div className={`character-choice-list ${illustrated ? 'is-illustrated' : ''}`} role="group" aria-label={title}>{Object.entries(ui_CHARACTER_CHOICES[field]).map(([key, label]) =>
    <button type="button" aria-pressed={value === key} key={key} onClick={() => onChange(key as CharacterPassport[K])}>
      {illustrated ? <span className={`character-choice-art art-${field} art-${key}`} aria-hidden="true"><i /><i /><i /></span> : null}<span>{String(label)}</span>{value === key ? <Check className="character-choice-check" size={12} /> : null}
    </button>)}</div></section>;
}
