'use client';
import { useInterfaceLocale } from './interface-locale';
import { intlLocale } from './translate';

export function useFormatLocale() { return intlLocale(useInterfaceLocale().locale); }
