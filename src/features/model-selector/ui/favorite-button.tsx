import { cn } from '@/shared/lib/cn';
export function FavoriteButton({ label, favorite, disabled, onClick }: {
  label: string; favorite: boolean; disabled?: boolean; onClick: () => void;
}) {
  return <button type="button" className={cn('model-favorite-button', favorite && 'is-favorite')}
    aria-label={`${favorite ? 'Удалить из избранного' : 'Добавить в избранное'}: ${label}`}
    aria-pressed={favorite} title={favorite ? 'Удалить из избранного' : 'Добавить в избранное'}
    disabled={disabled} onClick={(event) => { event.stopPropagation(); onClick(); }}>
    <span className="model-favorite-icon" aria-hidden="true" />
  </button>;
}
