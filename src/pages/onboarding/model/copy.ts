import type { OnboardingField, OnboardingLocale, OnboardingStep } from '@/shared/onboarding/contract';
export type Copy = readonly [string, string];
export const translate = (copy: Copy, locale: OnboardingLocale) => copy[locale === 'ru' ? 0 : 1];
export const steps: Record<OnboardingStep, { title: Copy; description: Copy; image: string }> = {
  about: { title: ['Давайте познакомимся', 'Let’s get acquainted'], description: ['Несколько деталей, чтобы обращаться к вам по имени и подобрать полезные подсказки.', 'A few details to help us make this space feel like yours.'], image: 'home' },
  work: { title: ['Как вы работаете?', 'How do you work?'], description: ['Расскажите о своей команде. Или просто о себе — если создаёте самостоятельно.', 'Tell us about your team — or just yourself if you work independently.'], image: 'projects' },
  goals: { title: ['Для чего вам нейросети?', 'What brings you to AI?'], description: ['Выберите то, что вам ближе. Можно отметить несколько целей.', 'Choose what matters to you. You can select more than one goal.'], image: 'stories' },
  tasks: { title: ['С чем вам помочь?', 'What would you like help with?'], description: ['Отметьте задачи, которые встречаются в вашей работе или личных проектах.', 'Select the tasks you encounter at work or in personal projects.'], image: 'library' },
  experience: { title: ['Ваш опыт с AI', 'Your experience with AI'], description: ['Здесь нет правильных ответов. Подстроим объяснения под ваш опыт.', 'There are no right answers. We’ll tailor guidance to your experience.'], image: 'flows' },
};
export const labels: Record<OnboardingField, Copy> = {
  age: ['Сколько вам лет?', 'Your age'], role: ['Чем вы занимаетесь?', 'What do you do?'],
  work: ['Ваш рабочий контекст', 'Your work setting'], team: ['Сколько человек в вашей команде?', 'How many people are on your team?'],
  industry: ['В какой сфере вы работаете?', 'What is your field?'], goals: ['Ваши цели', 'Your goals'], tasks: ['Ваши задачи', 'Your tasks'],
  experience: ['Как часто вы используете нейросети?', 'How often do you use AI?'],
  agents: ['Знакомы ли вы с AI-агентами?', 'Have you used AI agents?'],
  tools: ['Какие инструменты вы уже используете?', 'Which tools do you already use?'],
  automation: ['Работали со схемами и автоматизациями?', 'Have you worked with workflows and automations?'],
};
export const options: Record<OnboardingField, Record<string, Copy>> = {
  age: { under18: ['До 18', 'Under 18'], '18_24': ['18–24', '18–24'], '25_34': ['25–34', '25–34'], '35_44': ['35–44', '35–44'], '45_54': ['45–54', '45–54'], '55plus': ['55+', '55+'] },
  role: { design: ['Дизайн', 'Design'], marketing: ['Маркетинг / SMM', 'Marketing / SMM'], creator: ['Блог / контент', 'Blogging / content'], video: ['Видео / моушн', 'Video / motion'], founder: ['Предпринимательство', 'Entrepreneurship'], expert: ['Эксперт / консультант', 'Expert / consultant'], student: ['Учусь', 'Student'], other: ['Другое', 'Other'] },
  work: { solo: ['Работаю на себя', 'Self-employed'], company: ['Работаю в компании', 'Company employee'], business: ['Свой бизнес', 'Business owner'], agency: ['Агентство / студия', 'Agency / studio'], personal: ['Учёба / личные проекты', 'Study / personal projects'] },
  team: { solo: ['Только я', 'Just me'], '2_3': ['2–3', '2–3'], '4_5': ['4–5', '4–5'], '6_10': ['6–10', '6–10'], '11_50': ['11–50', '11–50'], '51plus': ['51+', '51+'] },
  industry: { commerce: ['Товары / магазин', 'Commerce'], services: ['Услуги', 'Services'], education: ['Образование', 'Education'], media: ['Медиа', 'Media'], it: ['IT', 'IT'], creative: ['Творчество', 'Creative work'], other: ['Другая сфера', 'Other'] },
  goals: { packaging: ['Упаковка продукта', 'Product presentation'], design: ['Дизайн', 'Design'], marketing: ['Маркетинг и реклама', 'Marketing & advertising'], blog: ['Личный блог', 'Personal blog'], brand: ['Личный бренд', 'Personal brand'], clients: ['Контент для клиентов', 'Client content'], team: ['Ускорить работу', 'Work faster'], learning: ['Учёба и эксперименты', 'Learning & experiments'], other: ['Своя цель', 'Another goal'] },
  tasks: { image: ['Изображения и фото', 'Images & photos'], video: ['Видео и короткие ролики', 'Videos & shorts'], motion: ['Анимация и моушн', 'Animation & motion'], editing: ['Монтаж', 'Video editing'], audio: ['Озвучка, музыка и звук', 'Voice, music & sound'], writing: ['Тексты и сценарии', 'Writing & scripts'], planning: ['Контент-планы', 'Content plans'], slides: ['Презентации', 'Presentations'], web: ['Сайты и лендинги', 'Websites & landing pages'], automation: ['Автоматизация', 'Automation'], other: ['Своя задача', 'Another task'] },
  experience: { new: ['Только начинаю', 'Just starting'], tried: ['Пробовал несколько раз', 'Tried a few times'], regular: ['Использую регулярно', 'Regular user'], workflow: ['AI — часть моей работы', 'AI is part of my workflow'] },
  agents: { new: ['Пока не знаком', 'Not yet familiar'], heard: ['Слышал, но не пробовал', 'Heard of them'], use: ['Пользуюсь готовыми', 'Use existing agents'], build: ['Собираю своих', 'Build my own'] },
  tools: { chatgpt: ['ChatGPT', 'ChatGPT'], claude: ['Claude / Claude Code', 'Claude / Claude Code'], antigravity: ['Antigravity', 'Antigravity'], codex: ['Codex', 'Codex'], cursor: ['Cursor', 'Cursor'], other: ['Другие', 'Other tools'], none: ['Пока не использую', 'None yet'] },
  automation: { new: ['Ещё не пробовал', 'Not yet'], templates: ['Использовал готовые', 'Used templates'], build: ['Собираю самостоятельно', 'Build my own'] },
};
