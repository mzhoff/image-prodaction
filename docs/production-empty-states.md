# Empty states в Production

Общий компонент: `src/shared/ui/production-empty-state.tsx`.
Изображения: `public/empty-states/*.webp`, 768 × 768 с прозрачным фоном.

| Раздел | Иллюстрация | Первый шаг |
| --- | --- | --- |
| Stories | Стеклянная книга со звездой | Создать Storyboard или Timeline |
| Storyboard | Янтарные рамки кадров | Создать раскадровку; внутри документа — добавить сцену |
| Timeline | Коралловые монтажные блоки | Создать монтаж; внутри — добавить материалы |
| Library | Фиолетовый лоток с медиа | Создать изображение |
| Flows | Голубые связанные узлы | Создать Flow |
| Проекты | Стеклянная папка с файлами | Создать проект; внутри — добавить файл |
| Использование | Голубые столбцы с линией роста | Пополнить баланс, если AI-доступ ещё не подключён или бюджет исчерпан |

## Поведение

- Состояние появляется после успешной загрузки пустого списка.
- Загрузка и ошибки загрузки остаются отдельными состояниями.
- Если результаты скрыты фильтрами, текст объясняет отсутствие результатов,
  а действие очищает поиск или фильтры. Не предлагаем создавать дубликаты.
- Разделы проекта используют иллюстрацию выбранного типа файла.
- Персонажи и стили используют иллюстрацию Library с собственным текстом.
- Кнопки вызывают существующие действия или открывают `/create`.
  Сам показ пустого состояния не создаёт документы и не запускает генерацию.

## Визуальные правила

- Одна стеклянная композиция, короткий заголовок, одна поясняющая фраза,
  основное действие. Для Stories допустимо второе действие.
- Декоративное изображение имеет пустой `alt`; текст доступен отдельно.
- Изображение показывается целиком через `object-fit: contain`.
  Не обрезать его с помощью `cover`, маски или контейнера с фиксированной высотой.
- Все объекты, тени, отражения и каустика должны завершаться внутри изображения.
  Сохранять прозрачное свободное поле со всех сторон.
- У текущих шести файлов крайние строки и столбцы имеют нулевую альфу.
  Минимальный отступ видимого содержимого (альфа ≥ 16/255) — 135 px при 1024 px.
- Основные кнопки монохромные; hover усиливает контраст.
  При `prefers-reduced-motion` движение выключено.
- Для компактных областей редактора или выбора стиля используется `compact`.

Иллюстрации созданы встроенной генерацией изображений; WebP получены
конвертацией и уменьшением без обрезки исходной композиции.

## Usage: исходный промпт

Режим: встроенный `image_gen`, новая иллюстрация с прозрачным фоном.
Итог: `public/empty-states/usage.webp`, 768 × 768, 54 484 байта, alpha.
После уменьшения добавлены прозрачные поля по 32 px; на границе файла нет непрозрачных пикселей.

```text
Use case: stylized-concept. Asset type: production-ready empty-state illustration for REVERIE Usage analytics, square 1024x1024 transparent PNG. Create a premium minimalist 3D glass object composition: three small rounded vertical blue crystal columns of ascending height representing analytics, one delicate smooth glass trend ribbon rising behind them, one small blue glass sphere at their base. Thick polished translucent cyan and cobalt-blue optical glass, elegant rounded forms, realistic gentle refraction, subtle blue caustics and soft local reflection. Match the restrained sculptural glass visual language of the existing REVERIE empty states; no typography, numbers, axes, labels, currency symbols, icons, UI, frames, plinth or background plane. Three-quarter isometric view, soft studio light. Actual transparent alpha background, not white and not a checkerboard drawn into the image. Entire composition including all highlights, reflections, soft shadow and caustics must fit within the central 65% of the canvas with a wide completely transparent margin on all four edges. No object, reflection, shadow or caustic may touch or be cut by the image boundary. Keep the silhouette clear and readable at 250px display size. Deliver one isolated glass illustration.
```
