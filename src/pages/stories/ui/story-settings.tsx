'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';
import type { StorySettings } from '@/modules/story-projects/contracts/story-project';
import { STORY_FORMATS, STORY_GENRES } from '@/modules/story-projects/core/story-presets';
import { Check, Film, Mic, Play, Sparkles } from '@prodactionpro/ui-core/icons';

const artwork = { free: 'atmosphere', 'short-film': 'cinema', advert: 'product', promo: 'product', youtube: 'voice', shorts: 'cinema', expert: 'voice' };
export function FormatCards({ settings, onSelect }: { settings: StorySettings; onSelect: (format: StorySettings['format']) => void }) {
  const tUi = useTranslations();
  const ui_STORY_FORMATS = useUiCatalog(STORY_FORMATS, tUi);
  return <div className="story-format-grid" role="group" aria-label={tUi("Формат истории")}>{ui_STORY_FORMATS.map((item, index) => {
    const Icon = item.value === 'expert' ? Mic : ['youtube', 'shorts'].includes(item.value) ? Play : item.value === 'free' ? Sparkles : Film;
    return <button type="button" className="story-format-card" data-tone={index % 4} key={item.value} aria-pressed={settings.format === item.value} onClick={() => onSelect(item.value)}>
      <span className="story-format-art"><img src={`/stories/story-${artwork[item.value]}.webp`} alt="" style={{ objectPosition: `${20 + index * 10}% center` }} draggable={false} /><Icon size={25} strokeWidth={1.3} />{settings.format === item.value ? <Check size={14} className="story-choice-check" /> : null}</span>
      <strong>{item.label}</strong><small>{item.duration < 60 ? tUi("{p1} сек", { p1: item.duration }) : tUi("{p1} мин", { p1: item.duration / 60 })} · {item.ratio}</small>
    </button>;
  })}</div>;
}
const moods = { free: ['Открытый финал', '✧'], comedy: ['Легко и с улыбкой', '◡'], tragedy: ['Чувства на первом плане', '◒'], horror: ['Неизвестность рядом', '◉'], thriller: ['Напряжение до финала', '⌁'], documentary: ['Жизнь как она есть', '◎'] };
export function GenreCards({ value, onChange }: { value: StorySettings['genre']; onChange: (genre: StorySettings['genre']) => void }) {
  const tUi = useTranslations();
  const ui_STORY_GENRES = useUiCatalog(STORY_GENRES, tUi);
  const ui_moods = useUiCatalog(moods, tUi);
  return <div className="story-mood-grid" role="group" aria-label={tUi("Жанр истории")}>{ui_STORY_GENRES.map((item) => <button type="button" key={item.value} className="story-mood-card" data-mood={item.value} aria-pressed={item.value === value} onClick={() => onChange(item.value)}>
    <span className="story-mood-image" aria-hidden="true"><img src={item.value === 'comedy' ? '/stories/story-product.webp' : item.value === 'documentary' ? '/stories/story-voice.webp' : '/stories/story-cinema.webp'} alt="" draggable={false} /><i>{ui_moods[item.value][1]}</i></span><strong>{item.label}</strong><small>{ui_moods[item.value][0]}</small>
    {item.value === value ? <Check size={15} className="story-choice-check" /> : null}
  </button>)}</div>;
}
export function RatioChoices({ value, onChange }: { value: StorySettings['aspectRatio']; onChange: (ratio: StorySettings['aspectRatio']) => void }) {
  const tUi = useTranslations();
  return <div className="story-ratio-choices" role="group" aria-label={tUi("Пропорции")}>{(['16:9', '9:16', '1:1'] as const).map((ratio) => <button type="button" aria-pressed={value === ratio} key={ratio} onClick={() => onChange(ratio)}><i style={{ aspectRatio: ratio.replace(':', '/') }} /><span>{ratio}</span><small>{ratio === '16:9' ? tUi("Широкий") : ratio === '9:16' ? tUi("Вертикальный") : tUi("Квадрат")}</small></button>)}</div>;
}
export function DurationChoices({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const tUi = useTranslations();
  return <div className="story-duration-choices" role="group" aria-label={tUi("Целевая длительность")}>{[15, 30, 60, 180, 480].map((seconds) => <button type="button" key={seconds} aria-pressed={seconds === value} onClick={() => onChange(seconds)}>{seconds < 60 ? tUi("{p1} сек", { p1: seconds }) : tUi("{p1} мин", { p1: seconds / 60 })}</button>)}
    <label><input aria-label={tUi("Своя длительность в секундах")} type="number" min={5} max={7200} value={value} onChange={(event) => onChange(Number(event.target.value))} /><span>{tUi("сек")}</span></label></div>;
}
