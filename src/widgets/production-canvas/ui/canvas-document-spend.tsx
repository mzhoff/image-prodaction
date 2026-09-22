'use client';
import { useFormatLocale } from '@/shared/i18n/use-format-locale';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';
import type { CSSProperties } from 'react';
import { AudioLines, Image, Type, Video, Bot } from '@prodactionpro/ui-core/icons';
import { DOCUMENT_USAGE_CATEGORIES, type DocumentUsage } from '@/modules/usage/contracts/document-usage';
import { formatBudgetMoney } from '../model/format-budget-money';
import { formatDocumentStart } from '../model/format-document-start';
import { ProTooltip } from '@/shared/ui/pro-tooltip';
import styles from './openrouter-balance.module.css';

const CATEGORIES = {
  text: { label: 'Текст', icon: Type }, image: { label: 'Изображения', icon: Image },
  video: { label: 'Видео', icon: Video }, audio: { label: 'Аудио', icon: AudioLines },
  assistant: { label: 'AI-ассистент', icon: Bot },
  other: { label: 'Прочее', icon: Type },
};

export function CanvasDocumentSpend({ data }: { data: DocumentUsage }) {
  const language = useFormatLocale();
  const tUi = useTranslations();
  const ui_CATEGORIES = useUiCatalog(CATEGORIES, tUi);
  const total = Number(data.total.costUsd ?? 0);
  return <section className={styles.session} aria-label={tUi("Расходы документа")}>
    <div className={styles.sessionHeading}>
      <div><DocumentSpendTitle /><span>{tUi("С {p1}", { p1: formatDocumentStart(data.createdAt, language) })}</span></div>
      <strong>{data.total.unknownCostRequests && total > 0 ? tUi("от ") : ''}{formatBudgetMoney(data.total.costUsd)}</strong>
    </div>
    <div className={styles.categories}>
      {DOCUMENT_USAGE_CATEGORIES.map((category) => {
        const row = data.categories.find((item) => item.category === category);
        if (category === 'other' && !row?.requests) return null;
        const { label, icon: Icon } = ui_CATEGORIES[category];
        const cost = row?.costUsd ?? (row?.requests ? null : '0');
        const share = total > 0 ? Math.max(0, Math.min(100, Number(cost ?? 0) / total * 100)) : 0;
        return <div key={category} className={styles.category} data-category={category}>
          <span className={styles.categoryIcon}><Icon size={14} aria-hidden="true" /></span>
          <div className={styles.categoryContent}>
            <div className={styles.categoryLabel}><span>{label} <small>{row?.requests ?? 0}</small></span>
              <span>{row?.unknownCostRequests && Number(cost) > 0 ? tUi("от ") : ''}{formatBudgetMoney(cost)}</span></div>
            <div className={styles.track} aria-hidden="true"><span style={{ '--share': `${share}%` } as CSSProperties} /></div>
          </div>
        </div>;
      })}
    </div>
    {data.total.requests === 0 && total === 0 ? <p className={styles.caption}>{tUi("Запросов пока нет. Расходы появятся здесь после запуска.")}</p> : null}
    {data.total.unknownCostRequests > 0 ? <p className={styles.caption} role="status">{tUi("Стоимость ещё уточняется для")}{' '} {data.total.unknownCostRequests} {requestWord(data.total.unknownCostRequests, true, language)}.</p> : null}
  </section>;
}

export function DocumentSpendTitle() {
  const tUi = useTranslations();
  const explanation = tUi('Все расходы AI-ассистента и генераций, связанных с этим документом, за всё время и для всех участников. Повторное открытие не сбрасывает сумму.');
  return <div className={styles.documentTitle}><h3>{tUi('В этом документе')}</h3>
    <ProTooltip label={explanation} wrap>
      <button type="button" className={styles.help} aria-label={explanation}>?</button>
    </ProTooltip>
  </div>;
}
function requestWord(value: number, genitive = false, language = 'ru-RU') {
  if (language === 'en-US') return value === 1 ? 'request' : 'requests';
  if (genitive) return value % 10 === 1 && value % 100 !== 11 ? 'запроса' : 'запросов';
  if (value % 100 >= 11 && value % 100 <= 14) return 'запросов';
  return value % 10 === 1 ? 'запрос' : value % 10 >= 2 && value % 10 <= 4 ? 'запроса' : 'запросов';
}
