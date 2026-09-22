'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { BookmarkCheck, Loader2 } from '@prodactionpro/ui-core/icons';
import { useEffect, useState } from 'react';
import { cn } from '@/shared/lib/cn';

interface SaveToLibraryButtonProps {
  assetId: string;
  className?: string;
  disabled?: boolean;
  onSave: (assetId: string) => Promise<void>;
  saved?: boolean;
}

export function SaveToLibraryButton({
  assetId,
  className,
  disabled,
  onSave,
  saved = false,
}: SaveToLibraryButtonProps) {
  const tUi = useTranslations();
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(saved);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setComplete(saved);
    setError(null);
  }, [assetId, saved]);

  async function handleSave() {
    if (pending || complete || disabled) return;
    setPending(true);
    setError(null);
    try {
      await onSave(assetId);
      setComplete(true);
    } catch (caughtError) {
      setError(caughtError instanceof Error
        ? caughtError.message
        : tUi("Не удалось сохранить. Попробуйте ещё раз."));
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="save-to-library-action">
      <button
        type="button"
        className={cn('save-to-library-button', complete && 'save-to-library-button-saved', className)}
        disabled={disabled || pending || complete}
        onClick={() => void handleSave()}
      >
        {pending ? <Loader2 className="spin" size={15} /> : <BookmarkCheck size={15} />}
        {pending ? tUi("Сохраняем…") : complete ? tUi("Сохранено в библиотеку") : tUi("Сохранить в библиотеку")}
      </button>
      {error ? <small role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</small> : null}
    </span>
  );
}
