# Интеграция PRODaction Feedback

## Что подключено

Image Production отправляет обратную связь на production endpoint:

```text
POST https://feedback.apption.space/v1/submissions
```

Браузер не обращается к внешнему сервису напрямую. Он отправляет черновик на
локальный маршрут Image Production `POST /api/product-feedback/submissions`, а
сервер приложения проверяет данные и формирует точный контракт PRODaction
Feedback. Это позволяет централизованно менять адрес сервиса и не раскрывать
внутренние настройки клиенту.

## Контракт запроса

Схема внешнего запроса не расширялась:

```json
{
  "submissionId": "uuid",
  "applicationId": "image-production",
  "source": "other",
  "rating": 5,
  "comment": "Текст комментария",
  "appVersion": "0.1.0",
  "buildNumber": "local",
  "platform": "web",
  "osVersion": "macOS",
  "locale": "ru-RU"
}
```

`submissionId` также передаётся в заголовке `Idempotency-Key`, чтобы повторная
попытка после сетевой ошибки не создала дубликат.

## Вложения

Текущий API принимает только оценку и текст и отклоняет неизвестные поля.
Интерфейс уже умеет вставлять изображение из буфера обмена или выбирать файл и
показывать предпросмотр, но блокирует отправку, пока вложение не удалено. Для
полноценной отправки скриншотов потребуется отдельное расширение API: например,
загрузка файла в объектное хранилище и добавление массива вложений в контракт.

## Настройки

Серверные переменные окружения:

```text
PRODACTION_FEEDBACK_ENDPOINT=https://feedback.apption.space/v1/submissions
PRODACTION_FEEDBACK_APPLICATION_ID=image-production
PRODACTION_FEEDBACK_BUILD_NUMBER=local
```

На сервере PRODaction Feedback приложение должно быть добавлено в allow-list:

```text
FEEDBACK_APPLICATIONS=veox-ios:VeoX,image-production:Image Production
```

Если `image-production` ещё не добавлен, API вернёт `unknown_application`, а
интерфейс покажет понятную ошибку настройки.

## Проверка доступности

```bash
curl --fail --silent --show-error https://feedback.apption.space/health/ready
```

Ожидаемый ответ:

```json
{"status":"ready","database":"ok"}
```
