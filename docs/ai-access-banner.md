# AI-доступ: приглашение к работе

## Актуальный путь доступа — 21 сентября 2026

Home (текст, фото, видео), ассистент Flow и соавтор Storyboard используют общий
`AiAccessBoundary`. При известном отсутствии доступа нажатие отправки открывает
одно `AiAccessDialog`: «Подключить AI», «Пополнить баланс» либо обращение к владельцу
при личном лимите. В бете подключение остаётся ручным через администратора Telegram.
Тарифы и платёжный шлюз не добавлены.

- Проверка выполняется до настроек запроса, optimistic message и платной операции.
  Черновик, выбранные параметры и вложения остаются в композере.
- Кэш существует только в памяти браузера, отдельно для каждого Workspace;
  successful connection живёт 60 секунд, подтверждённые отказы — до явной проверки.
  Выход из аккаунта очищает кэш. Это подсказка интерфейсу, не замена серверных прав.
- «Проверить доступ» обновляет подключение. После отказа по бюджету дополнительно
  запрашивается свежий остаток; после личного лимита — политика текущего участника.
  Проверка не создаёт генерации и не меняет баланс. Сетевой сбой не означает ноль.
- Серверный отказ после устаревшей проверки тоже открывает это окно. Его техническая
  ошибка и локальный неподтверждённый бабл не дублируются в истории. Сохранённые
  сообщения и ошибки других типов не удаляются.
- Пользовательские баблы всех этих интерфейсов чёрные с белым текстом, без тени.
  Строка действий имеет ширину бабла; «Копировать» выровнено слева.

Исходный `AiAccessBanner` и иллюстрация сохранены для повторного использования;
чат больше не вставляет постоянный баннер между сообщениями.

Композеры Home и Storyboard используют общий `ProductionComposerFrame`:
ввод, прикрепление референсов, жидкая поверхность, панель действий.
`ProductionTextComposer` добавляет существующий Library picker и отправку/
остановку ответа. Композер изображения сохраняет свои модель, формат, размер
и героев. ChatModule по-прежнему управляет разговором и загрузкой вложений;
у Storyboard остаются отдельный разговор и контекст сохранённого blueprint.

## Визуальный принцип

Направление подтверждено владельцем: минималистичные абстрактные 3D-объекты,
оптическое стекло, мягкое свечение, отражения и каустики, нейтральный размытый
фон. Жемчужные поверхности и небольшой синий/тёплый акцент создают выразительность
без визуального шума. Использовать для приглашений и пустых состояний;
не перекрывать текст декоративными объектами.

## Изображение и происхождение

- Инструмент: встроенный Imagegen, новая генерация без исходного референса.
- Сохранено: `public/stories/ai-access-portal.webp`, 960 × 640 (оптимизированная копия; оригинальный PNG сохранён).
- Оптимизированная доставка в интерфейсе: `next/image`; исходный PNG сохранён.
- Концепция: прозрачный портал, кобальтовая сфера, стеклянная лента и небольшой
  сатиновый шар на светлой поверхности.

Полный финальный промпт:

```text
Use case: stylized-concept. Asset type: premium REVERIE creative AI access invitation banner illustration, reusable in wide and narrow UI cards. Primary request: abstract, beautiful, exceptionally minimal luxury 3D still life: a luminous clear glass rounded portal/arch holding a floating small cobalt-blue glass sphere, a gently folded translucent ribbon passing through it and a tiny satin champagne orb on the floor. Express opening creative possibilities, calm optimistic invitation. Scene/backdrop: seamless very light warm pearl grey studio, neutral misted blurred background. Materials: optical glass with realistic refractions and caustics, liquid polished highlights, subtle brushed pearl surface, soft blue inner glow, tiny warm coral reflection. Composition: landscape 1536x1024, sculptural object grouped on RIGHT third, plenty of smooth clean negative space on LEFT half; objects fully visible, not cropped, restrained composition with only three main forms; object occupying about 55 percent image height. Lighting: sophisticated museum product photograph, broad soft daylight from upper left, beautiful focused reflected light on floor, delicate spectral caustics, no harsh contrast, tasteful expensive editorial mood. Render: extremely high quality physically based 3D, elegant minimal contemporary digital product brand. No typography, no logo, no text, no UI, no padlock, no coins, no credit cards, no robots, no sparkles/stars symbols, no clutter. White/pearl dominant, restrained cobalt-blue accent.
```

## Проверка

В локальном браузере проверены Home в режимах текста, изображения и видео:
отправка при неподключённом AI, повторное нажатие, открытие инструкции и
«Проверить доступ». Во всех случаях остаются один диалог и исходный черновик,
без нового сообщения в истории. По серверным логам подтверждено отсутствие
запросов настроек/отправки при известном отказе. Платная генерация не запускалась.

В существующей переписке Canvas проверены три пользовательских сообщения:
чёрный фон, белый текст, отсутствие тени и совпадение левого края действия
«Копировать» с краем короткого и длинного бабла.

Прошли 34 целевых теста: доступ и его кэш, лимиты, сохранение черновика,
отсутствие оптимистических сообщений при отказе, отображение ошибок и
авторизация отправки Home. Общие проверки `typecheck`, `lint`,
`check:architecture`, `check:size` и `git diff --check` прошли.
