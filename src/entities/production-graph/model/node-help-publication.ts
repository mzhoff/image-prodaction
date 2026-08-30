import type { ProductionNodeHelpMap } from './node-help-types';

export const publicationNodeHelp = {
  telegramPublication: {
    aliases: ['telegram post', 'telegram publication', 'publish telegram', 'пост в telegram', 'телеграм пост', 'публикация'],
    availability: 'addable',
    capabilities: [
      'Собирает rich-text пост и до 10 упорядоченных изображений.',
      'Показывает preview и позволяет копировать HTML или plain text.',
      'Может отправить пост в подключённый Telegram-канал отдельным действием пользователя.',
    ],
    execution: 'canvas-only',
    limitations: [
      'Для отправки нужны настроенный bot token, канал и права администратора у бота.',
      'Add to Plan пока недоступен; действуют ограничения Telegram на текст и media.',
      'Отправка не является server handler executable pipeline и требует отдельного действия в UI.',
      'Порты formatRules/checkRules видны в графе, но текущая публикация ещё не читает их значения.',
    ],
    portRules: [
      'Вход body принимает text; media-0..media-9 принимают image и задают порядок медиа.',
      'Зарегистрированные text-входы formatRules и checkRules пока не влияют на preview, проверку или отправку; выходных портов нет.',
    ],
    summary: 'Собирает Telegram-пост из текста и изображений, проверяет его и может отправить в канал.',
  },
} satisfies ProductionNodeHelpMap<'telegramPublication'>;
