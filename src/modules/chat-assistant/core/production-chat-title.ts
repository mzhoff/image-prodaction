export const PRODUCTION_CHAT_TITLE_INSTRUCTION = 'В начале ближайшего ответа добавь ровно один служебный тег <production_chat_title>Краткое название</production_chat_title>. Название на языке пользователя: 3–8 слов о его задаче и результате, до 90 символов. Например: «Проморолик кофейни к открытию». Не используй «Новый чат», кавычки, markdown или персональные данные. После тега дай обычный ответ или вызови нужный инструмент.';

export function takeProductionChatTitle(content: string) {
  const match = content.match(/^\s*<production_chat_title>([^<>\r\n]{1,120})<\/production_chat_title>\s*/u);
  return { title: match?.[1].replace(/[\u0000-\u001f]/gu, '').trim(), content: match ? content.slice(match[0].length) : content };
}
export function intentChatTitle(text: string) {
  return text.replace(/\s+/gu, ' ').trim().slice(0, 90) || 'Работа с референсами';
}
