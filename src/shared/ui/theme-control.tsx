'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Laptop } from '@prodactionpro/ui-core/icons';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@prodactionpro/ui-core/select';
import { useTheme } from '@prodactionpro/ui-core/theme';
import { isThemePreference, type ThemePreference } from '@prodactionpro/ui-core/theme-init';
import { cn } from '@/shared/lib/cn';

const THEME_OPTIONS = [
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
  { value: 'system', label: 'Системная' },
] as const;

// Sun/Moon пока нет в публичном icon facade. Это декоративные glyphs адаптера,
// не локальная копия Select или механизма управления темой.
export function ThemeIcon({ theme }: { theme: ThemePreference }) {
  if (theme === 'system') return <Laptop size={16} aria-hidden="true" data-theme-icon={theme} />;
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-theme-icon={theme}>
      {theme === 'light' ? <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
      </> : <path d="M20.5 14.5A9 9 0 0 1 9.5 3.5a9 9 0 1 0 11 11Z" />}
    </svg>
  );
}

export function ThemeControl({ className, menuClassName, portalContainer }: {
  className?: string;
  menuClassName?: string;
  portalContainer?: Element | null;
}) {
  const tUi = useTranslations();
  const ui_THEME_OPTIONS = useUiCatalog(THEME_OPTIONS, tUi);
  const { theme, setTheme } = useTheme();
  const selected = ui_THEME_OPTIONS.find((option) => option.value === theme)!;

  return (
    <Select value={theme} onValueChange={(value) => { if (isThemePreference(value)) setTheme(value); }}>
      <SelectTrigger className={cn('theme-control', className)} aria-label={tUi("Тема оформления")}
        onKeyDown={(event) => event.stopPropagation()}>
        <SelectValue>
          <span className="theme-control-option"><ThemeIcon theme={theme} />{selected.label}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className={cn('theme-control-menu', menuClassName)} portalContainer={portalContainer}
        position="popper" sideOffset={8} collisionPadding={12}
        onKeyDown={(event) => event.stopPropagation()}>
        {ui_THEME_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value} textValue={option.label}>
            <span className="theme-control-option"><ThemeIcon theme={option.value} />{option.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AuthThemeSwitch() {
  const tUi = useTranslations();
  const { resolvedTheme, setTheme } = useTheme();
  const options = [
    { value: 'light' as const, label: tUi('Светлая') },
    { value: 'dark' as const, label: tUi('Тёмная') },
  ];

  return (
    <div className="auth-theme-switch" role="group" aria-label={tUi('Тема оформления')} data-theme={resolvedTheme}>
      {options.map((option) => <button key={option.value} type="button" title={option.label}
        aria-label={option.label} aria-pressed={resolvedTheme === option.value}
        onClick={() => setTheme(option.value)}><ThemeIcon theme={option.value} /></button>)}
    </div>
  );
}
