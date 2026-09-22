'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Button } from '@prodactionpro/ui-core/button';
import { Check, Download, Workflow, Globe } from '@prodactionpro/ui-core/icons';
import { PRODUCTION_PLANS, type ProductionPlan } from '@/shared/billing/catalog';
import styles from './subscription-sheet.module.css';

export function SubscriptionPlans({ selected, onSelect }: { selected: ProductionPlan; onSelect: (plan: ProductionPlan) => void }) {
  const tUi = useTranslations();
  const ui_PRODUCTION_PLANS = useUiCatalog(PRODUCTION_PLANS, tUi);
  const icons = { start: Workflow, creator: Download, studio: Globe };
  return <>
    <div className={styles.intro}><span className={styles.eyebrow}>REVERIE · PRODUCTION</span><h2>{tUi("От первой идеи до своей студии")}</h2><p>{tUi("В бета-тесте платите только за AI-бюджет. Здесь — структура будущих тарифов.")}</p></div>
    <div className={styles.plans}>{ui_PRODUCTION_PLANS.map((plan) => {
      const Icon = icons[plan.id];
      return <article key={plan.id} className={styles.plan} data-selected={selected === plan.id}>
        <div className={styles.planHeading}><span className={styles.planIcon}><Icon size={24} /></span>{plan.id === 'creator' ? <span className={styles.pill}>{tUi("Больше свободы")}</span> : null}</div>
        <h3>{plan.name}</h3><p>{plan.description}</p>
        <div className={styles.price}>{tUi("Без платы за тариф")}<small>{tUi("во время закрытого бета-теста")}</small></div>
        <ul>{plan.features.map((feature) => <li key={feature}><Check size={16} /><span>{feature}</span></li>)}</ul>
        <div className={styles.planDifference}>{plan.integration ? tUi("Для интеграции в свои сервисы и продукты") : plan.export ? tUi("Экспорт и повторное использование Flows") : tUi("Создавайте и делитесь своими рецептами")}</div>
        <Button type="button" intent="neutral" appearance={selected === plan.id ? 'solid' : 'soft'} onClick={() => onSelect(plan.id)}>{tUi("Выбрать")}{' '} {plan.name}</Button>
      </article>;
    })}</div>
    <div className={styles.community}><Globe size={22} /><div><strong>{tUi("Рецептами можно делиться на любом тарифе")}</strong><p>{tUi("Community объединит публикации авторов и запуск их рецептов. Генерации используют бюджет того, кто запускает рецепт.")}</p></div><span className={styles.pill}>{tUi("В развитии")}</span></div>
    <p className={styles.footnote}>{tUi("Месячные и годовые цены объявим перед запуском подписок. Выбор здесь не меняет доступ и не включает списания.")}</p>
  </>;
}
