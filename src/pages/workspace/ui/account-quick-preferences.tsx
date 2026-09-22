'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useTheme } from '@prodactionpro/ui-core/theme';
import { useInterfaceLocale } from '@/shared/i18n/interface-locale';
import { ThemeIcon } from '@/shared/ui/theme-control';

export function AccountQuickPreferences() {
  const tUi = useTranslations();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, text } = useInterfaceLocale();
  return <div className="production-account-preferences">
    <fieldset><legend>{text('Оформление', 'Appearance')}</legend><div className="production-theme-options">
      {(['light', 'dark', 'system'] as const).map((value, index) => <button type="button" key={value} aria-pressed={theme === value}
        onClick={() => setTheme(value)}>
        <span className="production-theme-preview" data-preview-theme={value} aria-hidden="true"><i /><span /><span /></span>
        <span className="production-theme-caption"><ThemeIcon theme={value} />{[text('Светлая', 'Light'), text('Тёмная', 'Dark'), text('Авто', 'Auto')][index]}</span>
      </button>)}
    </div></fieldset>
    <fieldset><legend>{text('Язык интерфейса', 'Interface language')}</legend><div className="production-preference-options">
      <button type="button" lang="ru" aria-pressed={locale === 'ru'} onClick={() => setLocale('ru')}>{tUi("Русский")}</button>
      <button type="button" lang="en" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}
        title={text('English: меню и навигация. Остальные разделы ещё переводятся.', 'English covers menus and navigation. Other sections are still being translated.')}>English <small>beta</small></button>
    </div></fieldset>
  </div>;
}
