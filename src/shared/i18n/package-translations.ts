import { translateMessage, type InterfaceLocale, type MessageParams } from './translate';

/** Shared packages retain English source labels for compatibility with older hosts. */
const russianPackageMessages: Readonly<Record<string, string>> = {
  'Assistant is thinking': 'Ассистент думает',
  Conversation: 'Диалог', Menu: 'Меню', Style: 'Стиль', Theme: 'Тема', Radius: 'Скругление',
  Font: 'Шрифт', 'Icon Library': 'Набор иконок', 'Chat display': 'Отображение чата',
  'User avatar': 'Аватар пользователя', 'Assistant avatar': 'Аватар ассистента',
  'Assistant bubble': 'Фон ответа ассистента', 'Assistant mode': 'Режим ассистента',
  'Product profile': 'Профиль продукта', 'Product profiles': 'Профили продукта',
  'Assistant modes': 'Режимы ассистента', 'Allowed models': 'Доступные модели',
  Assistant: 'Ассистент', User: 'Пользователь', System: 'Система', Support: 'Поддержка',
  'AI action': 'Действие ассистента', 'AI action: {toolName}': 'Действие ассистента: {toolName}',
  Confirmation: 'Подтверждение', Attachment: 'Вложение', Archive: 'Архив',
  Presentation: 'Презентация', 'Rich text': 'Форматированный текст', Spreadsheet: 'Таблица',
  Text: 'Текст', File: 'Файл', 'Upload cancelled': 'Загрузка отменена',
  'Attachment upload failed': 'Не удалось загрузить вложение',
  'Unsupported attachment type': 'Неподдерживаемый формат вложения',
  'Attachment exceeds the configured size limit': 'Вложение превышает допустимый размер',
};

export function translatePackageMessage(locale: InterfaceLocale, source: string, params?: MessageParams) {
  return translateMessage(locale, locale === 'ru' ? russianPackageMessages[source] ?? source : source, params);
}
