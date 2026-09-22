'use client';
import { useInterfaceLocale } from '@/shared/i18n/interface-locale';
import { intlLocale } from '@/shared/i18n/translate';
import * as format from './usage-format';

export function useUsageFormat() {
  const { locale } = useInterfaceLocale();
  const language = intlLocale(locale);
  return {
    usageNumber: (value: string | number | null) => format.usageNumber(value, language),
    usageMoney: (value: string | null) => format.usageMoney(value, language),
    usageAverageMoney: (value: string | null) => format.usageAverageMoney(value, language),
    usageDate: (day: string) => format.usageDate(day, language),
    usageRangeLabel: (from: string, to: string) => format.usageRangeLabel(from, to, language),
  };
}
