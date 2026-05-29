export function getConnectionErrorMessage(sourceKind?: string, targetKind?: string) {
  if (sourceKind === 'image' && targetKind === 'text') return 'Нельзя передать изображение в текстовое поле.';
  if (sourceKind === 'text' && targetKind === 'image') return 'Нельзя передать текст в поле изображения.';
  return 'Эти порты нельзя соединить: тип данных не совпадает.';
}
