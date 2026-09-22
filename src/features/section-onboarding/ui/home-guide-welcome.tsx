import Image from 'next/image';
import type { SkippableOnboardingScenario } from '@prodactionpro/ui-onboarding';

export function homeGuideWelcome(tUi: (source: string) => string = (source) => source): SkippableOnboardingScenario {
  return {
    id: 'home-welcome', version: 1, skippable: true,
    labels: { back: tUi("Назад"), next: tUi("Далее"), complete: tUi("Начать онбординг"), skip: tUi("Пропустить онбординг"), formatProgress: () => '' },
    steps: [{
      id: 'welcome', eyebrow: 'REVERIE · PRODUCTION', title: tUi("Добро пожаловать в Production"),
      text: <><p>{tUi("Здесь ваши идеи становятся изображениями, видео и историями. Обсуждайте замысел с AI-ассистентом, создавайте материалы и собирайте их в проекты.")}</p><p>{tUi("Покажем, где найти основные инструменты. Знакомство можно пропустить и открыть снова через знак вопроса.")}</p></>,
      media: <Image src="/onboarding/home.webp" alt={tUi("Творческое пространство Production")} width={768} height={512} sizes="(max-width: 600px) 80vw, 520px" priority />,
      card: { tone: 'light', width: 'wide' },
      placement: { kind: 'center', overlay: { fill: 'var(--pui-semantic-text-primary)', opacity: .24 } },
    }],
  };
}
