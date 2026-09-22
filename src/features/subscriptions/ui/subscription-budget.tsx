'use client';
import { useFormatLocale } from '@/shared/i18n/use-format-locale';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useState } from 'react';
import { Button } from '@prodactionpro/ui-core/button';
import { Slider } from '@prodactionpro/ui-core/slider';
import { ArrowUpRight, Copy, CircleDollarSign } from '@prodactionpro/ui-core/icons';
import { BUDGET_PACKAGES, BUDGET_MIN, BUDGET_MAX, topUpRubles, type ProductionPlan, type PublicBillingConfig } from '@/shared/billing/catalog';
import type { BillingWorkspace } from '../model/use-billing-workspaces';
import { useTelegramHandoff } from '../model/use-telegram-handoff';
import { trackBehavior } from '@/shared/analytics/client';
import styles from './subscription-sheet.module.css';

export function SubscriptionBudget({ workspace, config, plan }: { workspace?: BillingWorkspace; config: PublicBillingConfig; plan: ProductionPlan }) {
  const language = useFormatLocale();
  const tUi = useTranslations();
  const [amount, setAmount] = useState(10);
  const [custom, setCustom] = useState(false);
  const [details, setDetails] = useState(false);
  const [copied, setCopied] = useState('');
  const telegram = useTelegramHandoff(workspace?.id, plan, amount);
  const owner = workspace?.role === 'owner';
  const quote = config.transfer ? topUpRubles(amount, config.transfer.rubPerUsd) : null;
  const changeAmount = (value: number) => { setAmount(value); setDetails(false); setCopied(''); };
  const rub = (value: number) => new Intl.NumberFormat(language, { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(value);
  const copy = async () => {
    if (!workspace) return;
    try {
      await navigator.clipboard.writeText(tUi("Workspace: {p1}\nID: {p2}\nAI-бюджет: ${p3}\nИнтересующий тариф: {p4}{p5}", { p1: workspace.name, p2: workspace.id, p3: amount, p4: plan, p5: quote === null ? '' : `\nСумма перевода: ${rub(quote)}` }));
      setCopied(tUi("Скопировано. Добавьте эти данные к квитанции."));
    } catch { setCopied(tUi("Не удалось скопировать. Укажите название пространства и сумму вручную.")); }
  };
  return <>
    <div className={styles.intro}><span className={styles.eyebrow}>{tUi("ОБЩИЙ БАЛАНС WORKSPACE")}</span><h2>{tUi("Дайте идеям продолжение")}</h2><p>{tUi("Один AI-бюджет для изображений, видео и ассистента.")}</p></div>
    <div className={styles.budgetLayout}>
      <section className={`${styles.budgetCard} ${styles.amountCard}`} aria-labelledby="budget-amount"><CircleDollarSign size={25} /><h3 id="budget-amount">{tUi("Сколько добавить?")}</h3>
        <div className={styles.packages} role="group" aria-label={tUi("Сумма пополнения")}>{BUDGET_PACKAGES.map((value) => <button type="button" key={value} aria-pressed={!custom && amount === value} onClick={() => { setCustom(false); changeAmount(value); trackBehavior('ip_topup_amount_selected', { amount_usd: value, selection: 'preset' }); }}><strong>${value}</strong><span>{tUi("AI-бюджета")}</span></button>)}</div>
        <div className={styles.customAmount} data-expanded={custom || undefined}>
          <button type="button" aria-expanded={custom} aria-controls="custom-budget-slider" onClick={() => { setCustom(true); setDetails(false); }}><span>{tUi("Своя сумма")}</span><strong>{custom ? `$${amount}` : '$10–200'}</strong></button>
          {custom ? <div id="custom-budget-slider" className={styles.customSlider}>
            <Slider value={amount} min={BUDGET_MIN} max={BUDGET_MAX} step={1} thumbShape="rect" thumbAriaLabel={tUi("Сумма пополнения в долларах")} getValueText={(value) => `$${value}`} onValueChange={changeAmount} onValueCommit={(value) => trackBehavior('ip_topup_amount_selected', { amount_usd: value, selection: 'custom' })} />
            <div className={styles.sliderLimits}><span>$10</span><span>$200</span></div>
          </div> : null}
        </div>
        <p>{tUi("Баланс принадлежит пространству. Все его участники используют его в пределах своих прав и лимитов.")}</p>
        <div className={styles.budgetContinue}><Button type="button" intent="neutral" appearance="solid" disabled={!owner} onClick={() => { setDetails(true); trackBehavior('ip_topup_instructions_viewed', { amount_usd: amount, selection: custom ? 'custom' : 'preset' }); }}>{tUi("Продолжить с $")}{amount}</Button>
        {!owner ? <p className={styles.note}>{workspace ? tUi("Пополнить баланс может владелец этого пространства.") : tUi("Выберите пространство для пополнения.")}</p> : null}</div>
      </section>
      <section className={styles.budgetCard} aria-labelledby="payment-heading"><h3 id="payment-heading">{details ? tUi("Пополнение переводом") : tUi("Как это работает")}</h3>
        {details && owner ? <>
          {config.transfer && quote !== null ? <div className={styles.transfer}>
            <strong className={styles.transferAmount}>{rub(quote)}</strong><span>{tUi("На AI-баланс: $")}{amount}  {' '}{tUi("· курс")}{' '} {rub(config.transfer.rubPerUsd)} / $</span>
            <dl><dt>{tUi("Получатель")}</dt><dd>{config.transfer.recipient}</dd><dt>{tUi("Банк")}</dt><dd>{config.transfer.bank}</dd><dt>{tUi("Реквизиты")}</dt><dd>{config.transfer.details}</dd><dt>{tUi("Назначение")}</dt><dd>{config.transfer.purpose}</dd></dl>
          </div> : <div className={styles.transfer}><strong>{tUi("Условия оплаты уточняются")}</strong><p>{tUi("Сумма в рублях и реквизиты появятся здесь после согласования с администратором бета-теста.")}</p></div>}
          <p>{tUi("Откройте Telegram — бот подготовит заявку на $")}{amount}  {' '}{tUi("для пространства «")}{workspace.name}{tUi("». После согласованного перевода отправьте ему квитанцию PDF или JPG.")}</p>
          <div className={styles.actions}><Button type="button" intent="neutral" appearance="soft" onClick={() => void copy()}><Copy size={15} />{tUi("Данные пополнения")}</Button>
            {config.telegramBotUrl ? <Button type="button" intent="neutral" appearance="solid" disabled={telegram.busy} onClick={() => void telegram.open()}>{telegram.busy ? tUi("Готовим заявку…") : tUi("Открыть в Telegram")}<ArrowUpRight size={15} /></Button> : null}</div>
          {telegram.error ? <p role="alert">{typeof (telegram.error) === 'string' ? tUi((telegram.error) as string) : (telegram.error)}</p> : null}
          {telegram.url ? <p role="status">{tUi("Заявка подготовлена.")}{' '} <a href={telegram.url} target="_blank" rel="noopener noreferrer">{tUi("Открыть бот повторно")}</a>{tUi(". Если Telegram предложит, нажмите «Старт».")}</p> : null}
          {copied ? <p role="status">{copied}</p> : null}
          {!config.telegramBotUrl ? <p className={styles.note}>{tUi("Бот для квитанций пока не подключён в этой среде.")}</p> : null}
        </> : <ol className={styles.steps}><li><strong>{tUi("Выберите сумму")}</strong><span>{tUi("Проверьте пространство, которое пополняете.")}</span></li><li><strong>{tUi("Оплатите по реквизитам")}</strong><span>{tUi("Сумма в рублях и условия — на следующем шаге.")}</span></li><li><strong>{tUi("Отправьте квитанцию")}</strong><span>{tUi("Бот передаст её администратору для проверки.")}</span></li><li><strong>{tUi("Вернитесь к творчеству")}</strong><span>{tUi("После подтверждения AI подключится к пространству.")}</span></li></ol>}
      </section>
    </div>
  </>;
}
