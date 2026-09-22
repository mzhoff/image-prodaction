import type { OnboardingStep, SkippableOnboardingScenario } from '@prodactionpro/ui-onboarding';

const target = (id: string, title: string, text: string, key = id, eyebrow?: string): OnboardingStep => ({
  id, title, text, eyebrow, card: { tone: 'light', width: 'compact' },
  placement: { kind: 'target', target: { kind: 'key', key }, preferredSide: 'auto',
    overlay: { fill: 'var(--pui-semantic-text-primary)', opacity: 0.24, spotlightPadding: 8, spotlightRadius: 20 },
    connector: { variant: 'line', width: 1.5 }, contactPoint: { variant: 'pulse' } },
});
export function homeGuideScenario(base: SkippableOnboardingScenario, tUi: (source: string) => string = (source) => source): SkippableOnboardingScenario {
  const steps = [
    target('navigation', tUi("Всё начинается здесь"), tUi("В боковом меню — разделы продукта, ваши проекты и сохранённые разговоры. Можно свернуть меню, чтобы освободить место."), 'navigation', tUi("Боковое меню")),
    target('ecosystem', tUi("Ваши продукты и пространства"), tUi("Здесь переключаются продукты и рабочие пространства. Материалы и AI-бюджет относятся к выбранному пространству."), 'ecosystem', tUi("Меню экосистемы")),
    target('home-actions', tUi("Действия текущего экрана"), tUi("В шапке — поиск по пространству, библиотека и помощь. Набор действий меняется вместе с разделом."), 'home-actions', tUi("Главные действия")),
    target('home-composer', tUi("Расскажите, что хотите создать"), tUi("Опишите задачу ассистенту. Можно добавить референсы и выбрать режим текста, изображения или видео. Переключение режима само не запускает генерацию."), 'home-composer', tUi("AI-ассистент")),
    target('help', tUi("Возвращайтесь, когда забыли"), tUi("Нажмите на знак вопроса, чтобы снова открыть знакомство с текущим разделом. Можно закрыть подсказки и вернуться к работе в любой момент."), 'help', tUi("Подсказки всегда рядом")),
  ] as const;
  return { ...base, labels: { ...base.labels, next: tUi("Далее"), skip: tUi("Пропустить онбординг"), formatProgress: (step, count) => `${step} / ${count}` },
    steps: [base.steps[0], ...steps.map((step) => ({ ...step, supplementaryAction: false }))] as [OnboardingStep, ...OnboardingStep[]] };
}
export function skipHintScenario(tUi: (source: string) => string = (source) => source): SkippableOnboardingScenario {
  return { id: 'section-guide-return-hint', version: 1, skippable: true,
    labels: { back: tUi("Назад"), next: tUi("Далее"), complete: tUi("Понятно"), skip: tUi("Закрыть"), formatProgress: () => '' },
    steps: [target('return-to-help', tUi("Продолжить можно здесь"), tUi("Когда понадобится подсказка, нажмите «?». Здесь можно вернуться к знакомству с этим экраном."), 'help')] };
}
