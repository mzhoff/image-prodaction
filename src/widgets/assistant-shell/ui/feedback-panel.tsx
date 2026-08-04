'use client';

import {
  AlertTriangle,
  CheckCircle2,
  FileImage,
  Paperclip,
  Send,
  Star,
  Trash2,
} from 'lucide-react';
import type { ChangeEvent, ClipboardEvent, FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { FEEDBACK_COMMENT_MAX_LENGTH } from '@/modules/feedback/contracts/feedback-contracts';
import {
  FeedbackApiError,
  submitProductFeedback,
} from '@/modules/feedback/adapters/client/feedback-api';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ratingValues = [1, 2, 3, 4, 5] as const;

interface FeedbackAttachmentDraft {
  file: File;
  previewUrl: string | null;
}
export function FeedbackPanel({ contextLabel }: { contextLabel: string }) {
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [attachment, setAttachment] = useState<FeedbackAttachmentDraft | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const pendingSubmissionRef = useRef<{ fingerprint: string; submissionId: string } | null>(null);

  useEffect(() => () => {
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
  }, [attachment]);

  const selectAttachment = (file: File) => {
    setAttachmentError(null);
    setSubmissionError(null);
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAttachmentError('Файл больше 10 МБ. Выберите изображение меньшего размера.');
      return;
    }

    setAttachment({
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    });
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) selectAttachment(file);
    event.target.value = '';
  };

  const handlePaste = (event: ClipboardEvent<HTMLElement>) => {
    const fileItem = Array.from(event.clipboardData.items).find((item) => item.kind === 'file');
    const file = fileItem?.getAsFile();
    if (!file) return;
    event.preventDefault();
    selectAttachment(file);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!rating || attachment || submitting) return;

    setSubmitting(true);
    setSubmissionError(null);
    const normalizedComment = comment.trim();
    const locale = getClientLocale();
    const osVersion = getClientOSLabel();
    const fingerprint = JSON.stringify([rating, normalizedComment, locale, osVersion]);
    const pending = pendingSubmissionRef.current;
    const submissionId = pending?.fingerprint === fingerprint
      ? pending.submissionId
      : crypto.randomUUID();
    pendingSubmissionRef.current = { fingerprint, submissionId };

    try {
      await submitProductFeedback({
        comment: normalizedComment || null,
        locale,
        osVersion,
        rating,
        submissionId,
      });
      pendingSubmissionRef.current = null;
      setSent(true);
    } catch (error) {
      setSubmissionError(error instanceof FeedbackApiError
        ? error.message
        : 'Не удалось отправить обратную связь. Попробуйте ещё раз.');
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setRating(null);
    setComment('');
    setAttachment(null);
    setAttachmentError(null);
    setSubmissionError(null);
    setSent(false);
    pendingSubmissionRef.current = null;
  };

  if (sent) {
    return (
      <div className="feedback-panel feedback-panel-success" role="status">
        <CheckCircle2 size={44} />
        <strong>Спасибо за обратную связь!</strong>
        <p>Отзыв отправлен в PRODaction Feedback и привязан к Image Production.</p>
        <button onClick={reset} type="button">Оставить ещё отзыв</button>
      </div>
    );
  }

  return (
    <form className="feedback-panel" onPaste={handlePaste} onSubmit={submit}>
      <div className="feedback-panel-intro">
        <strong>Как вам работа в Image Production?</strong>
        <p>Оцените продукт и напишите, что стоит исправить или улучшить.</p>
        <span>{contextLabel}</span>
      </div>

      <fieldset className="feedback-rating">
        <legend>Оценка</legend>
        <div>
          {ratingValues.map((value) => (
            <button
              aria-label={`${value} из 5`}
              aria-pressed={rating === value}
              className={rating !== null && value <= rating ? 'feedback-rating-selected' : ''}
              key={value}
              onClick={() => {
                setRating(value);
                setSent(false);
                setSubmissionError(null);
              }}
              type="button"
            >
              <Star size={26} fill="currentColor" />
            </button>
          ))}
        </div>
      </fieldset>

      <label className="feedback-comment">
        <span>Комментарий</span>
        <textarea
          maxLength={FEEDBACK_COMMENT_MAX_LENGTH}
          onChange={(event) => {
            setComment(event.target.value);
            setSent(false);
            setSubmissionError(null);
          }}
          placeholder="Что произошло? Что было неудобно? Какого результата вы ожидали?"
          value={comment}
        />
        <small>{comment.length}/{FEEDBACK_COMMENT_MAX_LENGTH}</small>
      </label>

      <div className="feedback-attachment-section">
        <div className="feedback-attachment-heading">
          <span>Скриншот</span>
          <label>
            <Paperclip size={14} />
            Добавить файл
            <input accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} type="file" />
          </label>
        </div>
        <p>Можно вставить изображение из буфера обмена через ⌘V.</p>

        {attachment ? (
          <div className="feedback-attachment-preview">
            {attachment.previewUrl ? (
              <img alt="Предпросмотр прикреплённого скриншота" src={attachment.previewUrl} />
            ) : <FileImage size={24} />}
            <div>
              <strong>{attachment.file.name || 'Скриншот из буфера'}</strong>
              <span>{formatFileSize(attachment.file.size)}</span>
            </div>
            <button aria-label="Удалить вложение" onClick={() => setAttachment(null)} type="button">
              <Trash2 size={15} />
            </button>
          </div>
        ) : null}

        {attachment ? (
          <div className="feedback-attachment-warning" role="alert">
            <AlertTriangle size={15} />
            <span>
              Текущий PRODaction Feedback принимает только оценку и текст. Удалите файл для отправки;
              поддержку вложений добавим отдельным расширением API.
            </span>
          </div>
        ) : null}
        {attachmentError ? <p className="feedback-field-error" role="alert">{attachmentError}</p> : null}
      </div>

      {submissionError ? <p className="feedback-submit-error" role="alert">{submissionError}</p> : null}

      <button
        className="feedback-submit-button"
        disabled={!rating || Boolean(attachment) || submitting}
        type="submit"
      >
        <Send size={15} />
        {submitting ? 'Отправляем…' : 'Отправить feedback'}
      </button>
    </form>
  );
}

function getClientLocale() {
  return (navigator.language || 'unknown').slice(0, 32);
}

function getClientOSLabel() {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('iphone') || userAgent.includes('ipad')) return 'iOS';
  if (userAgent.includes('android')) return 'Android';
  if (userAgent.includes('mac os')) return 'macOS';
  if (userAgent.includes('windows')) return 'Windows';
  if (userAgent.includes('linux')) return 'Linux';
  return 'Web';
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
