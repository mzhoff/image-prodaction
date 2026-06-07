export function getConnectionErrorMessage(sourceKind?: string, targetKind?: string) {
  if (sourceKind === 'subject' && targetKind !== 'reference') return 'Subject можно подключить к Actors в Generate Image.';
  if (targetKind === 'subject' && sourceKind !== 'subject') return 'К subject input можно подключить только Subject Builder.';
  if (sourceKind === 'location' && targetKind !== 'reference') return 'Location можно подключить к Background / Environment в Generate Image.';
  if (targetKind === 'location' && sourceKind !== 'location') return 'К location input можно подключить только Location Builder.';
  if (sourceKind === 'image' && targetKind === 'text') return 'Нельзя передать изображение в текстовое поле.';
  if (sourceKind === 'text' && targetKind === 'image') return 'Нельзя передать текст в поле изображения.';
  return 'Эти порты нельзя соединить: тип данных не совпадает.';
}
