# ADR: Composition Blueprint V1

- Статус: accepted for local canvas authoring
- Дата: 2026-08-26
- Владелец: Image Production

## Контекст

LLM не должна знать внутренний номер динамического входа `Composition` или
вручную синхронизировать `layer-N`, edge, `layers`, `layerOrder`, `groups` и
`layerInputCount`. Такая низкоуровневая запись хрупкая: малейшее расхождение
порождает общий отказ подготовки инструмента и не объясняет, какое поле неверно.

Для сценария «референс -> повторяемый редактируемый макет» нужен стабильный
контракт размещения. Он относится к созданию canvas-графа в браузере и не
реализует серверный рендер `Composition`.

## Решение

`pipeline_build` и `pipeline_update` принимают опциональный верхнеуровневый
массив `compositionBlueprints`. Blueprint V1 описывает одну Composition-ноду:

```ts
interface CompositionBlueprintV1 {
  version: 1;
  compositionNodeRef: string;
  mode: 'replace' | 'merge';
  canvas: { width: number; height: number };
  layers: CompositionBlueprintLayerV1[];
  groups?: CompositionBlueprintGroupV1[];
}

interface CompositionBlueprintLayerV1 {
  key: string;
  name: string;
  role: string;
  kind: 'text' | 'image';
  source: { nodeRef: string; portId: string };
  frame: { x: number; y: number; width: number; height: number };
  zIndex: number;
  rotation?: number;
  opacity?: number;
  visible?: boolean;
  locked?: boolean;
  blendMode?: string;
  image?: {
    fit?: 'fit' | 'fill' | 'stretch';
    preserveAspectRatio?: boolean;
    flipX?: boolean;
    flipY?: boolean;
  };
  text?: {
    align?: 'left' | 'center' | 'right';
    verticalAlign?: 'top' | 'center' | 'bottom';
    color?: string;
    gradient?: {
      type: 'linear';
      angle: number;
      stops: Array<{ color: string; offset: number }>;
    };
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string;
    letterSpacing?: number;
    lineHeight?: number;
    sizingMode?: 'auto-width' | 'auto-height' | 'fixed';
  };
}
```

`frame` хранится в нормализованных координатах 0..1. Compiler переводит её в
пиксели текущего canvas, поэтому один layout можно масштабировать на другой
размер. Размер canvas редактируется пользователем в инспекторе Composition.

## Семантика слоёв

- `kind` описывает контракт порта и допускает только `text` или `image`.
- QR — обычный `image` с `role: "qr"` и источником `qrCode.image`.
- Фон — обычный `image` с `role: "background"`.
- `key` — стабильный смысловой идентификатор внутри blueprint, а не индекс порта.
- `zIndex` определяет порядок от заднего плана к переднему.
- Группы V1 организационные: видимость, блокировка, сворачивание и список
  `layerKeys`; групповые трансформации не входят в V1.

## Обязанности compiler

Compiler работает до создания proposal и не изменяет документ:

1. Находит Composition и source-ноды по ref/id.
2. Проверяет уникальность ключей, границы canvas/frame и совместимость source
   port с `kind`.
3. Для `role: "qr"` требует image-источник QR Code.
4. Сортирует слои по `zIndex` и назначает реальные `layer-0..layer-N`.
5. Переводит нормализованные рамки в пиксели и формирует layer styles.
6. Записывает `layers`, `layerOrder`, `groups`, `layerInputCount` и canvas.
7. Создаёт или заменяет необходимые edges без второго соединения в один input.
8. Возвращает bounded diagnostics с точным JSON path; секреты и raw provider
   payload в ошибку не попадают.

`replace` полностью заменяет контракт слоёв указанной Composition-ноды.
`merge` обновляет существующие слои по стабильному `key` и сохраняет остальные.

## Заливки и пропорции

Composition сохраняет типизированную заливку:

- solid color;
- linear gradient с углом и упорядоченными color stops.

Legacy `color` читается для обратной совместимости. Новые controls редактируют
fill-модель. `preserveAspectRatio` остаётся включаемой настройкой image-слоя, но
её default — `false`: пользователь явно включает сохранение пропорций там, где
оно нужно.

## Лимиты

Первая версия поддерживает до 24 proposal nodes и до 24 слоёв одной
Composition-ноды. JSON schema и серверная компиляция используют один и тот же
лимит; превышение возвращает понятную validation issue, а не частичный граф.

## Стратегия рекламного макета

Если пользователь не выбрал отдельные объекты, создаётся простой вариант:

`Generate image (герой + фон + текст + декор) -> Composition <- QR Code -> Export`

QR всегда отдельный функциональный image-слой. Остальные объекты становятся
отдельными слоями только после явного выбора пользователя. Это даёт ранний
рабочий результат и позволяет усложнять граф итеративно.

## Отложено

Серверный `image.compose` runtime, точная отрисовка текста со шрифтами,
межпродуктовый редактор Content Hub, публичный recipe contract и server export
являются отдельным эпиком. Этот ADR не объявляет canvas-граф исполняемым
endpoint и не меняет границы платформы.
