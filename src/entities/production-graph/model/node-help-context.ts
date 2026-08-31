import type { ProductionNodeHelpMap } from './node-help-types';

export const contextNodeHelp = {
  router: {
    aliases: ['router', 'pass through', 'reroute', 'маршрутизатор', 'перенаправление'],
    availability: 'addable',
    capabilities: [
      'Прозрачно передаёт совместимое значение через граф.',
      'Compiler умеет находить исходный источник сквозь Router.',
    ],
    execution: 'transparent',
    limitations: [
      'Это не условное ветвление, switch или фильтр.',
      'Не преобразует значение и не имеет собственного server handler.',
      'Поля inputLabel/outputLabel зарезервированы в данных, но текущая карточка показывает статические Input/Output.',
    ],
    portRules: [
      'Вход input и выход output имеют kind any.',
      'При server resolution фактический kind и источник берутся из связи до Router.',
    ],
    summary: 'Прозрачно передаёт значение через статические Input/Output и упрощает разводку графа.',
  },
  iterator: {
    aliases: ['iterator', 'collection item', 'loop', 'итератор', 'элемент коллекции', 'перебор'],
    availability: 'addable',
    capabilities: [
      'Принимает коллекции изображений и текста раздельно.',
      'Позволяет выбрать kind и перейти к предыдущему или следующему элементу.',
      'Показывает активный индекс и текущий текстовый элемент.',
    ],
    execution: 'canvas-only',
    limitations: [
      'Сейчас это ручной selector одного элемента, а не автоматический server-side цикл.',
      'Серверного исполнителя executable pipeline нет.',
    ],
    portRules: [
      'Входы imageCollection и textCollection принимают соответствующие коллекции.',
      'Выходы imageItem:image и textItem:text передают текущий элемент выбранного kind.',
    ],
    summary: 'Выбирает текущий элемент из подключённой коллекции изображений или текста и передаёт его дальше.',
  },
  subjectBuilder: {
    aliases: ['subject', 'character passport', 'identity', 'персонаж', 'паспорт персонажа', 'объект'],
    availability: 'addable',
    capabilities: [
      'Собирает имя, тип, identity summary, неизменные и изменяемые признаки и negative constraints.',
      'Использует image refs и text notes, может подготовить AI-описание и canonical references.',
      'Позволяет опубликовать или обновить паспорт в Library.',
    ],
    execution: 'canvas-only',
    limitations: [
      'AI-операции зависят от провайдера; server runtime descriptor отсутствует.',
      'Typed subject разрешён как reference только для входа generateImage.actors.',
    ],
    portRules: [
      'Входы image и text принимают референсы и заметки; выход subject имеет kind subject.',
      'Поддерживаемая специализированная связь: subjectBuilder.subject -> generateImage.actors.',
    ],
    summary: 'Собирает устойчивый паспорт персонажа или объекта из изображений и текстовых заметок.',
  },
  locationBuilder: {
    aliases: ['location', 'location passport', 'environment', 'локация', 'паспорт локации', 'окружение'],
    availability: 'addable',
    capabilities: [
      'Собирает тип места, описание, планировку, атмосферу, изменяемые признаки и negative constraints.',
      'Использует image refs и text notes, может подготовить AI-описание места.',
      'Позволяет опубликовать или обновить паспорт в Library.',
    ],
    execution: 'canvas-only',
    limitations: [
      'AI-операции зависят от провайдера; server runtime descriptor отсутствует.',
      'Typed location разрешён как reference только для входа generateImage.background.',
    ],
    portRules: [
      'Входы image и text принимают референсы и заметки; выход location имеет kind location.',
      'Поддерживаемая специализированная связь: locationBuilder.location -> generateImage.background.',
    ],
    summary: 'Собирает устойчивый паспорт места из изображений и заметок о планировке и атмосфере.',
  },
} satisfies ProductionNodeHelpMap<'router' | 'iterator' | 'subjectBuilder' | 'locationBuilder'>;
