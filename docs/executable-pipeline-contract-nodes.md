# Контрактные ноды Executable Pipeline

Дата: 2026-08-21
Статус: реализуется как совместимый P0 поверх существующего Runtime

Связанное решение: [ADR явных границ](./executable-pipeline-contract-boundaries-adr.md).

## Зачем это нужно

Корневая текстовая нода не обязательно является параметром внешнего API: в ней
могут лежать стабильные правила продукта. Аналогично, последний элемент графа не
обязательно является публичным результатом. Поэтому внешний контракт нельзя
надёжно выводить только из топологии draft-графа.

Новый режим делает границы видимыми на canvas:

```text
Pipeline Input -> production nodes -> Structured Output -> Pipeline Output
```

- `Pipeline Input` объявляет значения, которые меняются между запусками;
- обычные ноды хранят постоянную реализацию и правила;
- `Structured Output` формирует и проверяет JSON по схеме;
- `Pipeline Output` объявляет публичный результат.

## Модель поля

Каждое поле содержит:

```ts
interface PipelineContractField {
  id: string;
  key: string;
  kind: 'text' | 'number' | 'boolean' | 'image' | 'json';
  required: boolean;
  description?: string;
  defaultValue?: JSONValue;
  fields?: PipelineContractField[];
}
```

`id` принадлежит редактору и образует стабильный port ID `field:<id>`.
Переименование или перестановка строки не меняет связь. `key` является
публичным именем параметра и входит в immutable contract опубликованной версии.

Вложенные `fields` разрешены только для `json`. Они описывают состав объекта,
но не становятся самостоятельными портами: один top-level JSON field остаётся
одним значением графа. Вложенные строки поддерживают `text`, `number`,
`boolean` и `json`; `image` в P0 разрешён только как самостоятельное поле
верхнего уровня `Pipeline Input` или `Pipeline Output`. Ограничения P0: не
более 24 полей в одном объекте и не более трёх уровней вложенности.

## Интерфейс карточек

Композиция повторяет знакомую модель `Text Splitter`: одно поле — одна строка.
В строке доступны публичный key, тип, required/optional и порт. Тип меняется в
popover, который рендерится поверх canvas через portal. JSON-строка раскрывает
дочерние поля с отступом.

Безопасность редактирования:

- удаление top-level поля и его связей — одна операция undo;
- несовместимый тип подключённого поля нельзя сменить до отключения связи;
- nested JSON fields меняют схему родительского JSON-порта;
- сервер повторно проверяет схему и не доверяет browser snapshot.

## Компиляция и совместимость

Explicit contract mode включается, если в executable section есть хотя бы одна
`Pipeline Input` или `Pipeline Output`. В этом режиме требуется ровно по одной
boundary-ноде каждого вида. Boundary-ноды не исполняются: compiler превращает
их строки в `inputs`, `outputs` и `outputContracts`.

Старые draft без boundary-нод продолжают компилироваться legacy-способом, а уже
опубликованные immutable plans не переписываются. Расширение runtime-контракта
additive: `outputContracts`, JSON schema и defaults необязательны для старых
версий, но обязательны логически для новых explicit publications.

## Runtime

Runtime применяет один валидатор контрактов:

1. проверяет и дополняет defaults входов до постановки платной работы;
2. не передаёт отсутствующий optional input обработчику;
3. проверяет JSON не как `any`, а по рекурсивной схеме;
4. проверяет публичные outputs до статуса `succeeded`;
5. возвращает стабильные ошибки `pipeline_input_invalid` и
   `pipeline_output_invalid`.

`Structured Output` исполняется операцией `ai.structured.generate`. Провайдеру
передаётся строгая JSON schema, однако ответ всё равно проверяется локально.
Допускается не более одной отдельной идемпотентной попытки исправления.

## Публикация и потребители

Для версии сохраняются три независимые контрольные суммы:

- общий checksum compiled plan;
- `inputSchemaChecksum`;
- `outputSchemaChecksum`.

Потребитель привязывается к semantic capability и pinned immutable version, а
не к node ID или mutable draft. `Pipeline Consumer`, его credentials и исходящее
`Connection` являются разными сущностями. Content Hub сохраняет созданную тему
в собственной базе после получения типизированного результата; Pipeline Runtime
не пишет напрямую в его доменные таблицы.

## Проверки P0

- стабильность портов после rename/reorder;
- запрет duplicate/invalid public keys;
- required output без связи блокирует публикацию;
- несовместимые типы блокируют связь или публикацию;
- defaults и отсутствующие optional inputs исполняются корректно;
- scalar/null не проходят object JSON schema;
- public output валидируется до `succeeded`;
- legacy plan без `outputContracts` продолжает работать;
- schema checksum не зависит от координат canvas;
- разные Consumers не читают, не отменяют и не скачивают runs друг друга.
