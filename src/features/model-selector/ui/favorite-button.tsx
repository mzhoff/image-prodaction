'use client';
import { useTranslations } from '@/shared/i18n/use-translations';
import { cn } from '@/shared/lib/cn';
export function FavoriteButton({ label, favorite, disabled, onClick }: {
  label: string; favorite: boolean; disabled?: boolean; onClick: () => void;
}) {
  const tUi = useTranslations();
  return <button type="button" className={cn('model-favorite-button', favorite && 'is-favorite')}
    aria-label={`${favorite ? tUi("Удалить из избранного") : tUi("Добавить в избранное")}: ${label}`}
    aria-pressed={favorite} title={favorite ? tUi("Удалить из избранного") : tUi("Добавить в избранное")}
    disabled={disabled} onClick={(event) => { event.stopPropagation(); onClick(); }}>
    <span className="model-favorite-icon" aria-hidden="true" />
  </button>;
}
