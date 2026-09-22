'use client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@prodactionpro/ui-core/select';
import { useInterfaceLocale } from './interface-locale';
import './language-control.css';

const LANGUAGE_OPTIONS = [
  { value: 'ru', short: 'RU', label: 'Русский', flag: '🇷🇺', lang: 'ru', disabled: false },
  { value: 'en', short: 'EN', label: 'English', flag: '🇬🇧', lang: 'en', disabled: false },
  { value: 'zh', short: 'ZH', label: '中文', flag: '🇨🇳', lang: 'zh', disabled: true },
  { value: 'de', short: 'DE', label: 'Deutsch', flag: '🇩🇪', lang: 'de', disabled: true },
  { value: 'es', short: 'ES', label: 'Español', flag: '🇪🇸', lang: 'es', disabled: true },
] as const;

function LanguageOption({ option, compact = false, comingSoon }: {
  option: typeof LANGUAGE_OPTIONS[number]; compact?: boolean; comingSoon?: string;
}) {
  return <span className="interface-language-option">
    <span className="interface-language-flag" aria-hidden="true">{option.flag}</span>
    <span lang={option.lang}>{compact ? option.short : option.label}</span>
    {comingSoon ? <small>{comingSoon}</small> : null}
  </span>;
}

export function LanguageControl() {
  const { locale, setLocale, text } = useInterfaceLocale();
  const selected = LANGUAGE_OPTIONS.find((option) => option.value === locale)!;
  const label = text('Язык приложения', 'Application language');
  const comingSoon = text('Скоро', 'Soon');
  return <Select value={locale} onValueChange={(value) => {
    if (value === 'ru' || value === 'en') setLocale(value);
  }}>
    <SelectTrigger className="interface-language-select" aria-label={label}>
      <SelectValue><LanguageOption compact option={selected} /></SelectValue>
    </SelectTrigger>
    <SelectContent className="interface-language-menu" position="popper" sideOffset={8} collisionPadding={12}>
      {LANGUAGE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}
        textValue={option.label} disabled={option.disabled}>
        <LanguageOption option={option} comingSoon={option.disabled ? comingSoon : undefined} />
      </SelectItem>)}
    </SelectContent>
  </Select>;
}
