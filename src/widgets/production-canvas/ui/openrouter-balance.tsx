'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, RefreshCw, CircleDollarSign } from '@prodactionpro/ui-core/icons';
import { Button } from '@prodactionpro/ui-core/button';
import { useSubscriptions } from '@/features/subscriptions/ui/subscription-provider';
import { useCanvasBudget } from '../model/use-canvas-budget';
import { formatBudgetMoney } from '../model/format-budget-money';
import { CanvasDocumentSpend, DocumentSpendTitle } from './canvas-document-spend';
import { ProTooltip } from '@/shared/ui/pro-tooltip';
import styles from './openrouter-balance.module.css';

export function OpenRouterBalance({ workspaceId, documentId }: { workspaceId?: string; documentId?: string }) {
  const tUi = useTranslations();
  const openSubscriptions = useSubscriptions();
  const [expanded, setExpanded] = useState(false);
  const { balance, usage, refresh } = useCanvasBudget(workspaceId, documentId, expanded);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const detailsId = useId();
  const disconnected = balance.data?.status === 'disconnected';
  const budget = balance.data?.status === 'connected' ? balance.data.budget : null;
  const remaining = disconnected ? 0 : budget?.remaining;
  const busy = balance.loading || usage.loading;
  const remainingPercent = budget?.limit && budget.remaining !== null
    ? Math.max(0, Math.min(100, budget.remaining / budget.limit * 100)) : 0;

  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setExpanded(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); setExpanded(false); trigger.current?.focus();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape, true);
    };
  }, [expanded]);

  return <div ref={root} className={styles.card} data-onboarding-target="canvas-budget" data-expanded={expanded} data-snapshot-exclude data-canvas-ui data-canvas-wheel-block="true"
    onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}
    onDoubleClick={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}
    onContextMenu={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
    <div className={styles.header}><button ref={trigger} type="button" className={styles.trigger} onClick={() => setExpanded((value) => !value)}
      aria-expanded={expanded} aria-controls={detailsId} aria-label={tUi("Баланс: {p1}. {p2}", { p1: formatBudgetMoney(remaining), p2: expanded ? tUi('Свернуть') : tUi('Подробнее') })}>
      <span className={styles.wallet}><CircleDollarSign size={18} aria-hidden="true" /></span>
      <span className={styles.balanceLabel}><span>{tUi("Доступно")}</span><strong>{formatBudgetMoney(remaining)}</strong></span>
      <ChevronDown className={styles.chevron} size={16} aria-hidden="true" />
    </button>
      {expanded ? <div className={styles.headerRefresh}><ProTooltip label={tUi('Обновить баланс и расходы')} side="bottom">
        <button type="button" className={styles.refresh} onClick={refresh} disabled={busy} aria-label={tUi('Обновить баланс и расходы')}>
          <RefreshCw size={16} className={busy ? styles.spinning : undefined} aria-hidden="true" />
        </button>
      </ProTooltip></div> : null}
    </div>
    <div className={styles.reveal} id={detailsId} aria-hidden={!expanded} inert={!expanded}>
      <div className={styles.revealClip}><div className={styles.details}>
        {disconnected ? <p className={styles.notice}>{tUi("Ключ не подключён. Доступный баланс — $0.")}</p>
          : budget ? <>
            <div className={styles.limitTrack} role={budget.limit !== null && budget.remaining !== null ? 'meter' : undefined}
              aria-label={tUi("Остаток лимита")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={remainingPercent}
              aria-valuetext={tUi("{p1} из {p2}", { p1: formatBudgetMoney(budget.remaining), p2: formatBudgetMoney(budget.limit) })}>
              <span style={{ width: `${remainingPercent}%` }} />
            </div>
            <dl className={styles.metrics}>
              <div><dt>{tUi("Лимит ключа")}</dt><dd>{budget.limit === null ? tUi("Не задан") : formatBudgetMoney(budget.limit)}</dd></div>
              <div><dt>{tUi("Израсходовано из лимита")}</dt><dd>{formatBudgetMoney(budget.spentFromLimit)}</dd></div>
            </dl>
            {budget.limit === null ? <p className={styles.caption}>{tUi("У ключа нет заданного лимита. Остаток не определён.")}</p> : null}
          </> : <p className={styles.notice} role="status">{balance.error ? tUi("Не удалось получить баланс.") : tUi("Проверяем баланс…")}</p>}
        {balance.error && balance.data ? <p className={styles.notice} role="status">{tUi("Не удалось обновить баланс. Показаны последние данные.")}</p> : null}
        <Button type="button" className={styles.topUp} size="md" intent="neutral" appearance="solid" disabled={!workspaceId}
          onClick={() => { setExpanded(false); openSubscriptions({ workspaceId, tab: 'budget', source: 'canvas_balance' }); }}>
          {tUi("Пополнить баланс")}
        </Button>
        {usage.data ? <CanvasDocumentSpend data={usage.data} /> : <div className={styles.session}>
          <DocumentSpendTitle /><p className={styles.caption} role="status">{!documentId ? tUi("Сохраните документ, чтобы учитывать расходы документа.")
            : usage.error ? tUi("Не удалось загрузить расходы документа.") : tUi("Загружаем расходы документа…")}</p>
        </div>}
        {usage.error && usage.data ? <p className={styles.notice} role="status">{tUi("Расходы не обновились. Показан последний расчёт.")}</p> : null}
      </div></div>
    </div>
    {balance.error ? <span className={styles.warningDot} title={tUi("Баланс не обновлён")} /> : null}
  </div>;
}
