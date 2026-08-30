import type { ProductionNodeHelpMap } from './node-help-types';

export const pipelineNodeHelp = {
  pipelineInput: {
    aliases: ['pipeline input', 'public input', 'endpoint input', 'вход пайплайна', 'публичный вход'],
    availability: 'addable',
    capabilities: [
      'Объявляет top-level поля типов text, number, boolean, image и json.',
      'Использует field.key как стабильное внешнее имя параметра.',
      'Создаёт динамический выход для каждого top-level поля.',
    ],
    execution: 'boundary',
    limitations: [
      'Нужна для внешнего API или executable pipeline, а не для обычного редактируемого canvas.',
      'Явный pipeline должен содержать ровно одну Pipeline input.',
      'Входящие связи запрещены; вложенные JSON-поля не создают отдельные graph-порты.',
      'Общая схема ограничена 24 полями и тремя уровнями вложенности.',
      'Постоянные инструкции и правила остаются в обычных нодах графа, а не становятся внешними параметрами.',
    ],
    portRules: [
      'Каждое top-level поле создаёт выход field:<field.id> с kind поля и label, равным field.key.',
      'Входных портов нет.',
    ],
    summary: 'Объявляет типизированные внешние параметры опубликованного executable pipeline.',
  },
  pipelineOutput: {
    aliases: ['pipeline output', 'public output', 'endpoint result', 'выход пайплайна', 'публичный результат'],
    availability: 'addable',
    capabilities: [
      'Объявляет top-level результаты типов text, number, boolean, image и json.',
      'Поддерживает обязательные и optional поля со стабильными semantic keys.',
      'Создаёт динамический вход для каждого top-level поля.',
    ],
    execution: 'boundary',
    limitations: [
      'Явный pipeline должен содержать ровно одну Pipeline output.',
      'Исходящие связи запрещены; обязательное поле требует совместимого server-runtime источника.',
      'Хотя бы один публичный результат должен быть подключён.',
      'Общая схема ограничена 24 полями и тремя уровнями вложенности.',
    ],
    portRules: [
      'Каждое top-level поле создаёт вход field:<field.id> с kind поля и label, равным field.key.',
      'Выходных портов нет.',
    ],
    summary: 'Объявляет типизированные публичные результаты executable pipeline.',
  },
  structuredOutput: {
    aliases: ['structured output', 'json schema', 'json extraction', 'структурированный вывод', 'json результат'],
    availability: 'addable',
    capabilities: [
      'Преобразует текстовый или JSON-контекст в серверно проверенный объект.',
      'Возвращает весь JSON и значения top-level полей отдельными выходами.',
      'Поддерживает model, instruction, reasoning, temperature, schemaName и рекурсивные fields.',
    ],
    execution: 'server',
    limitations: [
      'Нужна схема минимум с одним полем; общий предел — 24 поля и три уровня вложенности.',
      'Executable Structured output не поддерживает image-поля ни на верхнем, ни на вложенном уровне.',
      'Вызывает AI-модель, поэтому результат зависит от провайдера и проходит серверную валидацию.',
    ],
    portRules: [
      'Вход source принимает any; выход json возвращает полный JSON.',
      'Каждое top-level поле создаёт выход field:<field.id> соответствующего kind.',
    ],
    summary: 'Преобразует входной контекст в проверенный JSON по типизированной схеме.',
  },
} satisfies ProductionNodeHelpMap<'pipelineInput' | 'pipelineOutput' | 'structuredOutput'>;
