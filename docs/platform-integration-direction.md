# Image Production в продуктовой платформе

Уточнение 22.09.2026: ЮKassa отложена до завершения релиза; прототип убран из кода.
Текущие цены и ручной сценарий с квитанцией сохраняются. Будущая оплата через
бота и сайт принадлежит общему Identity; Stars также остаются в бэклоге.
См. [платёжный сценарий](subscriptions-and-payments.md).


Статус: согласованное направление развития, не команда немедленной реализации.

20 сентября 2026: владелец согласовал отдельный транспорт Telegram/OpenRouter в
Амстердаме после подтверждённых сетевых отказов Timeweb. Это закрытый шлюз через
ограниченный SSH-туннель, без переноса пользователей, Workspace, ключей и учёта usage.
Серверный `OPENROUTER_BASE_URL` применяется ко всем OpenRouter-вызовам, включая Ask AI.
Новых ключей, денежных операций и автоматических повторов оплачиваемых запросов
шлюз не создаёт. Контракт шлюза: центральный ADR
`docs/adr/2026-09-20-amsterdam-provider-egress.md` в Ludimogut.

Каноническая платформенная архитектура хранится в центральном репозитории
Ludimogut: docs/product-platform-architecture.md.

Связанный proposed ADR для потребителей Runtime API:
[API-first integration and a thin consumer SDK](./runtime-api-consumer-sdk-adr.md).

## 1. Роль продукта

Image Production остается самостоятельной визуальной производственной студией:

- проектирование production graph;
- создание и редактирование визуальных материалов;
- работа с references и assets;
- подключение AI providers;
- публикация immutable executable pipeline versions;
- durable execution;
- usage и provider cost;
- библиотека результатов.

Image Production не должен превращаться в:

- Content Hub;
- CRM;
- систему контент-планирования;
- центральный Identity Service;
- центральный Billing Service;
- хранилище всех знаний бренда;
- продуктовый fork ChatModule.

### Быстрая генерация в Home

Уточнение владельца от 21 сентября 2026: Home в Production получает собственный
разговорный интерфейс быстрой генерации — референс, текст или диктовка, результат.
Он дополняет повторяемые Flows и не зависит от развития самостоятельного Reverie AI.
Универсальная логика чата остаётся в ChatModule; производственные задания, assets,
права и usage используют существующие механизмы Production. Это не новый agent loop
и не отдельная система провайдеров/оплаты. Путь Reverie AI пока открыт.
Подробности и границы первого среза: [Home assistant](./home-assistant-experience.md).

Дополнение владельца от 21 сентября 2026: личные производственные разговоры
Home, Storyboard и Flow доступны в группе «Чаты» внутри Production, с архивом,
корзиной, именованием и переносом в проект вместе с результатами. ChatModule
продолжает владеть сообщениями, вложениями, исполнением и usage; продуктовый слой
хранит организацию и связи с документами. Это прямо уточняет прежнюю запись
от 17 сентября о списке чатов только в Reverie AI. Детали:
[Чаты Production и референсы](./production-chats-and-references.md).

## 2. Связь с общим Workspace

Уточнение владельца от 21 сентября 2026 по тарифам: публикация рецептов в Community
доступна всем уровням; экспорт для переиспользования — с Creator; использование
исполняемых Flows в собственных продуктах/сервисах — Studio. На этапе беты
пополнение AI-бюджета ($10 / $25 / $50) отделено от будущей цены подписки.
Общая шторка тарифов — продуктовая UI-проекция, не новый Billing Service и не
клиентский источник entitlements. Детали: [Тарифы и платежи](./subscriptions-and-payments.md).

Существующая модель Workspace и Membership является сильным прототипом
платформенного направления.

В будущем канонический Workspace создается и управляется Platform Control Plane.
Image Production получает стабильные:

- userId;
- organizationId;
- workspaceId;
- membership/permission context;
- entitlements;
- service identity.

До утвержденной миграции существующие Workspace нельзя удалять, пересоздавать
или заменять несовместимыми идентификаторами.

Целевое правило:

> Один и тот же workspaceId имеет одинаковый смысл в Content Hub,
> Image Production, Chat Agent, KnowledgeModule, VeoX и Telegram.

Image Production продолжает хранить workspaceId у документов, assets, provider
connections, generation jobs, pipelines, runs и usage.

## 3. Identity и доступ

На текущем этапе Better Auth остается product-owned composition.

Будущее направление:

- Platform Identity является issuer;
- Image Production проверяет platform token на сервере;
- browser workspace header является только selector;
- membership и entitlement проверяются сервером;
- service-to-service execution использует service account, а не cookie
  администратора;
- отзыв membership должен закрывать доступ к документам, assets, chat и
  pipelines.

Не следует добавлять еще одну независимую модель Organization/Subscription
внутрь Image Production без отдельного платформенного RFC.

## 4. Владение данными

Image Production владеет:

- production documents;
- canvas graph;
- node configuration;
- pipeline definitions;
- immutable pipeline versions;
- pipeline endpoints;
- pipeline runs;
- node runs;
- provider connections и credential versions;
- generation jobs;
- execution artifacts;
- execution usage events.

Платформа владеет:

- глобальными users;
- organizations;
- canonical workspaces;
- invitations;
- product catalog;
- entitlements;
- seat assignments;
- subscriptions;
- cross-product audit identity.

Content Hub владеет:

- контент-планом;
- брифами;
- редакционным workflow;
- назначениями;
- согласованием;
- публикационными задачами.

KnowledgeModule владеет:

- бренд-контекстом;
- Tone of Voice;
- публичной документацией;
- revisions;
- retrieval и citations.

## 5. Executable Pipeline как платформенная capability

Другие продукты не должны зависеть от canvas node IDs или draft graph.

Интеграция выполняется через стабильную capability binding:

~~~text
workspaceId
capabilityKey
pipelinePublicId
pinnedVersion
schemaChecksum
inputMapping
outputMapping
maximumCost
enabled
~~~

Примеры:

~~~text
content.generate.telegram-post
content.prepare-video-package
media.create-thumbnail
brand.generate-article-cover
support.prepare-response
~~~

Published pipeline version immutable. Изменение origin document не должно
молча менять активный endpoint.

Runtime API обязан сохранять:

- service authentication;
- workspace ownership;
- allowed source applications;
- input/output schemas;
- idempotency;
- concurrency limits;
- maximum cost;
- durable status;
- cancellation;
- artifacts;
- usage attribution;
- audit.

Telegram, VeoX и Content Hub вызывают pipeline как capability. Они не должны
знать внутреннее устройство graph.

## 6. Когда выделять Pipeline Runtime

Pipeline Runtime остается логическим модулем внутри Image Production, пока не
появится хотя бы один из triggers:

- несколько независимых production consumers;
- самостоятельная нагрузка;
- отдельный release cadence;
- отдельные требования доступности;
- необходимость изолировать provider credentials;
- worker pool масштабируется независимо от Studio.

До появления trigger не создавать отдельный микросервис только ради будущей
архитектуры.

## 7. ChatModule

Image Production подключает ChatModule как released exact-version package
family и сохраняет продуктовые adapters.

ChatModule владеет:

- chat lifecycle;
- transport;
- attachments lifecycle;
- persistent conversation events;
- UI/runtime;
- safe tool protocol.

Image Production владеет:

- Better Auth/session composition;
- workspace resolution;
- graph validation;
- document revision checks;
- product tools;
- pipeline capability mapping;
- canvas UI boundaries.

Не копировать универсальную chat-логику обратно в consumer. Если не хватает
контракта, зафиксировать upstream requirement и удалить workaround после
появления публичного API.

## 8. Assets и общий Media Service

Существующая Library остается product-owned до появления реального
cross-product Media Service.

Будущий обмен с VeoX и Content Hub должен использовать stable assetId и
managed object storage references, а не копирование файлов между продуктами.

При изменении asset contract предусмотреть:

- workspaceId;
- checksum;
- provenance;
- ownerProductId;
- immutable original;
- derived assets;
- signed access;
- retention;
- migration notes.

## 9. Usage и будущий Billing

Image Production не рассчитывает тариф и не меняет entitlement самостоятельно.
Он эмитит нормализованные append-only usage events:

- workspace;
- initiator;
- product;
- operation;
- pipeline run/node run;
- provider/model;
- tokens;
- provider cost;
- duration;
- asset/storage effect.

Control Plane позднее преобразует usage в лимиты, overage или credits.

Финальная модель монетизации не утверждена. Не добавлять жесткую связь role,
subscription и execution до расчета экономики для 10–15 и 50–100 компаний.

## 10. Межпродуктовые события

Внешние изменения передаются через версионированные события:

~~~text
pipeline.version.published
pipeline.run.queued
pipeline.run.succeeded
pipeline.run.failed
media.asset.created
usage.recorded
~~~

Каждое событие содержит eventId, version, workspaceId, correlationId и
occurredAt. Consumer обязан быть idempotent.

На раннем этапе достаточно PostgreSQL Outbox и polling/webhooks.

## 11. Правила для будущих изменений

Перед архитектурным изменением агент должен ответить:

1. Это Studio, Pipeline Runtime или общеплатформенная ответственность?
2. Кто владеет данными?
3. Как проверяется workspace ownership?
4. Нужны ли service account и scopes?
5. Является ли operation дорогой или долгой?
6. Где idempotency, retry и recovery?
7. Меняется ли публичный contract?
8. Есть ли migration notes и consumer checks?
9. Есть ли измеримый trigger для нового сервиса?
10. Не фиксирует ли изменение неутвержденную модель Billing?

Если ответ меняет общую платформенную границу, сначала подготовить RFC/ADR и
согласовать его с центральным архитектурным документом.

## Реализация входа — 17 сентября 2026

Добавлен opt-in OIDC/PKCE клиент общего Identity с собственной сессией Production.
Вход остаётся на странице Production; добавлены email/Telegram кнопки и отдельный /account.
Существующий профиль привязывается после недавнего входа, без смены user/Workspace IDs
и без объединения по email. См. [включение и ограничения](identity-integration.md).


### Уточнение беты: бюджет принадлежит Workspace (20 сентября 2026)

[Принятое решение и границы реализации](workspace-budget-adr.md): один ключ
`WSP_{workspace_id}`, начисления на Workspace, серверный учёт расходов каждого
участника и лимиты владельца. Генерации и Ask AI используют один ключ. Личный лимит
в бете останавливает новые запросы по известным расходам; последний запрос может
превысить его. Существующие Workspace IDs и ownership сохраняются.

### Локальная доработка меню беты — 20 сентября 2026

Единый Telegram-бот читает сводку бюджетов через подписанный серверный
`POST /v1/platform/budget-summary`. Production сам разрешает Identity subject в
локального пользователя и проверяет его memberships; бот не читает БД продукта.
Возвращаются только название/роль Workspace, состояние подключения и остаток
по последней успешной проверке провайдера с временем проверки. Нет ключей,
истории чужих пользователей или предположения, что сумма начислений равна остатку.
Если свежий остаток недоступен, возвращается `null`, а не ноль. Это read-only
представление действующей модели бюджета, не новый Billing Service.

### Заявка с сайта в Telegram — 21 сентября 2026

Production разрешает сессию в Identity subject и проверяет владельца Workspace;
Identity принимает подписанный `budget.handoff.v1`, повторно проверяет владение
через API продукта и хранит заявку с контекстом квитанции. Выбранный тариф отражает
интерес пользователя; он не назначает entitlements. Начисление остаётся ручным
действием оператора через существующий журнал. Новые Workspace/ключи не создаются
по клику, продукт не становится Billing Service. См. [процесс и включение](subscriptions-and-payments.md).
