import type { ProductionNodeHelpMap } from './node-help-types';

export const textNodeHelp = {
  textPrompt: {
    aliases: ['prompt template', 'text template', 'variables', 'template variables', 'текстовый шаблон', 'шаблон с переменными', 'переменные промта'],
    availability: 'addable',
    capabilities: [
      'Хранит обычный текст или шаблон с динамическими переменными.',
      'Поддерживает до 10 переменных и детерминированную серверную подстановку.',
      'Порядок упоминаний @Alias задаёт порядок сборки текста.',
    ],
    execution: 'server',
    limitations: [
      'Сама не вызывает AI-модель.',
      'Чтобы подключённое значение попало в результат, его alias нужно упомянуть в тексте как @Alias.',
    ],
    portRules: [
      'Динамические входы variable-0..variable-9 принимают text; выход text возвращает готовый текст.',
      'Без входящих связей нода может стать неявной входной границей executable pipeline.',
      'Порты variable-N принадлежат Text prompt; text-N принадлежат Text concat.',
      'В простом рекламном макете текст остаётся частью общего Generate image art; отдельная Text prompt нужна, когда пользователь хочет независимо редактировать надпись.',
    ],
    summary: 'Хранит редактируемый текст или шаблон и подставляет подключённые значения в @Alias.',
  },
  textConcat: {
    aliases: ['concat', 'concatenation', 'join text', 'merge text', 'конкатенация', 'склеивание текста', 'объединение текста', 'сборка промпта'],
    availability: 'addable',
    capabilities: [
      'Детерминированно объединяет упорядоченные текстовые источники.',
      'Server handler поддерживает перенос строки, двойной перенос, пробел или пользовательский разделитель, а также prefix и suffix.',
      'Исполняется на сервере как text.concat.',
    ],
    execution: 'server',
    limitations: [
      'Studio всегда показывает минимум два input-слота, но server handler объединяет фактически подключённые непустые значения и может получить только одно.',
      'Текущий Studio preview не добавляет prefix, хотя executable server handler его применяет; результаты могут отличаться.',
      'Не меняет смысл и не генерирует новый текст.',
      'Текущий inputCount не имеет верхнего ограничения в модели графа.',
    ],
    portRules: [
      'Входы text-0, text-1, text-2 и далее принимают text; выход result возвращает text.',
      'Индекс порта определяет порядок частей в результате.',
    ],
    summary: 'Объединяет несколько текстовых входов с выбранным разделителем, prefix и suffix.',
  },
  textGeneration: {
    aliases: ['generate text', 'prompt builder', 'генерация текста', 'сборка промпта'],
    availability: 'addable',
    capabilities: [
      'Преобразует текст по постоянной instruction и выбранному output style.',
      'Позволяет настроить model, reasoning, temperature и outputStyle.',
      'Подходит для сборки production-ready prompt и другой текстовой переработки.',
    ],
    execution: 'server',
    limitations: [
      'Принимает один текстовый вход; несколько источников нужно заранее объединить.',
      'Вызывает провайдера, поэтому результат вероятностный, платный и зависит от доступности модели.',
    ],
    portRules: [
      'Вход text принимает text; выход result возвращает text.',
      'result можно подключить к generateImage.prompt, Formatter или другому text-входу.',
      'Постоянные правила хранятся в instruction, а изменяемый текст приходит через вход text.',
    ],
    summary: 'Преобразует входной текст AI-моделью по постоянной instruction и возвращает новый текст.',
  },
  textToSpeech: {
    aliases: ['text to speech', 'tts', 'voice generation', 'синтез речи', 'озвучка', 'голос'],
    availability: 'addable',
    capabilities: [
      'Генерирует голосовую дорожку из входного или локального текста.',
      'Поддерживает выбор модели, языка, голоса, формата и доступных параметров модели.',
      'Хранит историю результатов и позволяет воспроизводить выбранную версию.',
    ],
    execution: 'canvas-only',
    limitations: [
      'В реестре нет выходного audio-порта, поэтому результат нельзя штатно продолжить связью.',
      'Серверного исполнителя executable pipeline нет.',
      'Доступные параметры и результат зависят от провайдера и модели.',
    ],
    portRules: ['Вход text принимает text; выходных портов нет.'],
    summary: 'Генерирует голосовую дорожку из текста с выбранными моделью, языком, голосом и форматом.',
  },
  textFormatter: {
    aliases: ['formatter', 'format text', 'rich text', 'форматирование текста', 'редактор текста', 'телеграм форматирование'],
    availability: 'addable',
    capabilities: [
      'Форматирует и редактирует входной текст в rich text editor.',
      'Поддерживает presets universal, telegram-post, blog-article и markdown.',
      'Исполняется на сервере как text.format.',
    ],
    execution: 'server',
    limitations: [
      'Не создаёт новый смысловой текст сама.',
      'Доступные инструменты форматирования зависят от выбранного preset.',
      'Серверный handler пока не воспроизводит rich-text preset: он выбирает подключённый или fallback text, заменяет неразрывные пробелы и обрезает края.',
    ],
    portRules: ['Вход text принимает text; выход result возвращает форматированный text.'],
    summary: 'Даёт rich-text editor с preset в Studio и передаёт нормализованный текст дальше в server pipeline.',
  },
  textSplitter: {
    aliases: ['split text', 'delimiter', 'text chunks', 'разделение текста', 'разбивка текста', 'сплиттер'],
    availability: 'addable',
    capabilities: [
      'Детерминированно разбивает текст по delimiter.',
      'Возвращает коллекцию и отдельные динамические item outputs.',
      'Показывает полученные фрагменты в карточке ноды.',
    ],
    execution: 'server',
    limitations: [
      'Текущий интерфейс поддерживает только delimiter mode.',
      'Возвращает не больше 30 отдельных item outputs.',
      'Пустой вход не создаёт элементов.',
      'Live registry пока объявляет items как text, хотя server handler возвращает коллекцию; для scalar text-потребителей нужно использовать item-N.',
    ],
    portRules: [
      'Вход text принимает text; выход items сейчас имеет kind text в live registry, но несёт коллекцию в server runtime.',
      'Динамические выходы item-0..item-29 возвращают отдельные text-элементы фактического результата.',
    ],
    summary: 'Разбивает входной текст по разделителю на коллекцию и отдельные элементы.',
  },
} satisfies ProductionNodeHelpMap<
  'textPrompt' | 'textConcat' | 'textGeneration' | 'textToSpeech' | 'textFormatter' | 'textSplitter'
>;
