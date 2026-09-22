import type { OnboardingStep, SkippableOnboardingScenario } from '@prodactionpro/ui-onboarding';

/** A separate tour of the editor, independent of the Flows catalog introduction. */
export function canvasGuideScenario(base: SkippableOnboardingScenario, t: (text: string) => string): SkippableOnboardingScenario {
  const steps: OnboardingStep[] = [
    { id: 'canvas-title', title: t('Название и действия с Flow'), text: t('Слева вверху можно переименовать Flow, добавить его в избранное и открыть меню документа. Стрелка возвращает к списку Flows. Изменения сохраняются автоматически.') },
    { id: 'canvas-palette', title: t('Добавьте первый шаг'), text: t('Кнопка «+» открывает инструменты, шаблоны и избранное. Добавьте нужные ноды на холст и соедините выход одного шага со входом другого.') },
    { id: 'canvas-tools', title: t('Управляйте холстом'), text: t('Внизу — выделение, секции, разрезание связей, отмена и повтор действий. Кнопка масштаба помогает увидеть весь Flow. Масштабируйте жестом на тачпаде, перемещайте холст прокруткой.') },
    { id: 'canvas-assistant', title: t('Помощник рядом'), text: t('Опишите задачу ассистенту или добавьте материалы. Он поможет собрать и настроить Flow. Окно можно закрыть и снова открыть кнопкой ассистента.') },
    { id: 'canvas-budget', title: t('Баланс и расходы'), text: t('Справа вверху — доступный AI-бюджет. Нажмите на него, чтобы увидеть расходы этого Flow или пополнить баланс. Платные запросы используют бюджет пространства.') },
    { id: 'help', title: t('Подсказки всегда под рукой'), text: t('Кнопка «?» рядом с балансом снова откроет эту инструкцию. Можно пропустить знакомство и сразу начать работу.') },
  ].map((step) => ({ ...step, card: { tone: 'light', width: 'compact' }, supplementaryAction: false,
    placement: { kind: 'target', target: { kind: 'key', key: step.id }, preferredSide: 'auto',
      overlay: { fill: 'var(--pui-semantic-text-primary)', opacity: 0.24, spotlightPadding: 8, spotlightRadius: 20 },
      connector: { variant: 'line', width: 1.5 }, contactPoint: { variant: 'pulse' } } }));
  return { ...base, steps: [base.steps[0], ...steps] };
}
