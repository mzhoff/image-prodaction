# Базовый аудиоконтур: локальная проверка 2026-09-06

## Статус и границы

Реализовано в ветке `codex/audio-pipelines`; локальный Docker-контур пересобран.
Накопленная предыдущая работа сохранена коммитом `06c6703` и слита в **локальный**
`main` коммитом `f4c2d6d`. Push/merge в удалённый main и деплой не выполнялись:
существующий CI запускает staging deployment при push в main.

Это проверка Image Production. Код Content Hub и пользовательские опубликованные
pipelines не изменялись. Для E2E создавались отдельные QA-документы и версии.
Распознавание и озвучка реализованы, но платные вызовы реальных моделей в этой
проверке не запускались: качество речи и распознавания ещё требует ручного QA.

## Что вошло

- Универсальный Import: изображения и аудио; формат определяется содержимым.
  Ogg Opus/Vorbis, M4A AAC/ALAC, MP3, WAV, AAC, FLAC; до 50 MiB и 30 минут,
  один аудиопоток, не более двух каналов. PDF и видео вне текущего scope.
- Проигрывание, пауза и перемотка приватных аудиофайлов на canvas; единые
  сиреневые audio-порты и линии. Сохранение обычного свёрнутого состояния нод.
- Transcribe (`speechToText`): аудио → текст, последовательные FLAC-фрагменты
  до 60 секунд через OpenRouter. По умолчанию `google/gemini-3.1-flash-lite`.
- Audio Convert (`audioConvert`): MP3, WAV, FLAC, Ogg Opus; настройки битрейта,
  частоты и каналов. Реальная конвертация FFmpeg в Studio и durable runtime.
- Voice (`textToSpeech`): managed audio output; серверная озвучка и упаковка
  PCM в WAV. До 5000 символов и 20 MiB результата на один запрос.
- Audio в Pipeline Input/Output, приватные артефакты, проверка принадлежности
  Workspace и целостности. Загрузка извне требует отдельного
  `pipeline.asset.write`; старые ключи не получают новые права автоматически.
- Live-каталог, Ask AI, MCP/settings, инструкции и тесты обновлены вместе.

Полные ограничения и порядок ручного тестирования: [audio-pipelines.md](audio-pipelines.md).
Контракт загрузки/хранения: [audio-infrastructure.md](audio-infrastructure.md).

## Результаты проверок

| Проверка | Результат |
| --- | --- |
| Typecheck, lint, architecture, size, database schema, diff whitespace | PASS |
| Production Docker build с FFmpeg и packaged contracts | PASS |
| Unit/contract suite внутри финального FFmpeg-образа | 616 PASS, 0 fail, 0 skip |
| Coverage gates | PASS: lines 74.48%, branches 76.87%, functions 70.87% |
| Реальные codec fixtures (входят в 616) | 4 PASS, включая конвертацию, chunks, отмену и очистку temp |
| Browser canvas E2E | PASS |
| Runtime HTTP E2E | PASS |
| Вызовы платных моделей в E2E | 0 |

Browser E2E проверил upload, play/seek, конвертацию, подключение Audio Output и
сохранение свёрнутых нод после перезагрузки. Runtime E2E проверил:

1. Выпуск отдельного ограниченного QA-ключа и загрузку синтетического WAV.
2. Повтор загрузки с тем же Idempotency-Key и конфликт при изменённом запросе.
3. Запуск pinned версии Input audio → MP3 Convert → Output audio и replay.
4. STRICT с нулевой стоимостью, COMPLETE usage и нулём provider calls.
5. Защищённое скачивание MP3, проверку MIME, размера и SHA-256.
6. Отказ без upload scope, без авторизации, для чужого asset/run,
   необъявленного артефакта и неверного типа asset.

Контрольный run: `01a0753a-972d-7a40-af71-bed95d3a30e9`.
Выход: `audio/mpeg`, 9836 bytes,
SHA-256 `80f50528f2ff8b4a7a1541475df3febbfb79d843035f6366f7601511afd0cb47`.
Ключи отозваны в завершении теста; дополнительно имели TTL один час.
Небольшие QA-fixtures оставлены для аудита; пользовательские данные не удалялись.
Независимый host ffprobe необязателен и отсутствовал; реальные кодеки проверены
обязательными тестами внутри FFmpeg-образа, без пропусков.

Команды для повторения на подготовленном локальном контуре:

```sh
docker exec -e AUDIO_CODEC_TESTS_REQUIRED=1 image-prodaction-web-1 npm run test:coverage
AUDIO_LOCAL_E2E=1 PLAYWRIGHT_BASE_URL=http://localhost:3004 npx playwright test e2e/audio-runtime.spec.ts e2e/audio-canvas.spec.ts --workers=1
```

## Локальное окружение и следующий шаг

Миграция `0026_bright_shadowcat.sql` применена. Web и оба worker здоровы;
readiness через `localhost:3004` и Visual Intent `127.0.0.1:7310` подтверждён.
Использованы существующие Compose names, базы и volumes; второй стек не создавался.

После завершения сборок удалён только восстанавливаемый build cache: Docker
сообщил 5.212 GB, непосредственно на диске свободное место выросло примерно
с 31 до 33 GiB; более поздний замер — 35 GiB. Это всё ещё ниже порога 15%.
Контейнеры, образы, базы, volumes и пользовательские файлы не удалялись.

Дальше — ручная проверка короткой собственной записи и выбранного голоса на
реальном провайдере с осознанным лимитом расходов. STRICT нельзя считать
поддержанным для платной модели без гарантированной верхней границы стоимости;
он остаётся fail-closed. Интеграция интерфейса Content Hub с audio и отправка
результата в Telegram — отдельная следующая задача, не результат этого E2E.
