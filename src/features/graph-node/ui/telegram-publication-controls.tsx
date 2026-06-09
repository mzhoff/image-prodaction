import { ChevronUp } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { PublicationValidationReport } from '@/entities/production-graph/model/publication';
import { TELEGRAM_MAX_MEDIA_ITEMS } from '../lib/telegram-media-layout';
import { PortButton } from './port-button';

export function PublicationInputSection({
  children,
  countLabel,
  headerPort,
  isOpen,
  kind,
  label,
  onOpenChange,
}: {
  children: ReactNode;
  countLabel?: string;
  headerPort?: ReactNode;
  isOpen: boolean;
  kind: 'image' | 'text';
  label: string;
  onOpenChange: (isOpen: boolean) => void;
}) {
  return (
    <section className={`publication-input-section publication-input-section-${kind}`}>
      <div className="publication-input-section-header">
        {headerPort}
        <span>{label}</span>
        {countLabel ? <span className="publication-input-count">{countLabel}</span> : null}
        <button
          type="button"
          className="publication-input-section-toggle"
          aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${label}`}
          onClick={() => onOpenChange(!isOpen)}
          data-node-interactive
        >
          <ChevronUp size={16} className={isOpen ? undefined : 'publication-input-section-toggle-closed'} />
        </button>
      </div>
      {isOpen ? (
        <div className="publication-input-section-body">
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function PublicationActionButton({
  disabled,
  icon,
  label,
  nodeId,
  onClick,
  onStartConnection,
  portId,
  portLabel,
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  nodeId: string;
  onClick?: () => void;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  portId: string;
  portLabel: string;
}) {
  const isDisabled = disabled ?? !onClick;

  return (
    <div className="publication-node-action-row">
      <PortButton
        nodeId={nodeId}
        portId={portId}
        side="input"
        kind="text"
        label={portLabel}
        className="publication-action-input-port"
        onStartConnection={onStartConnection}
      />
      <button
        type="button"
        className="secondary-node-button publication-node-action-button"
        disabled={isDisabled}
        onClick={onClick}
        data-node-interactive
      >
        {icon}
        {label}
      </button>
    </div>
  );
}

export function PublicationValidation({
  imageCount,
  messageCharacterLimit,
  messageLength,
  mediaOverflow,
  validation,
}: {
  imageCount: number;
  messageCharacterLimit: number;
  messageLength: number;
  mediaOverflow: boolean;
  validation: PublicationValidationReport;
}) {
  const exceedsTextLimit = messageLength > messageCharacterLimit;
  return (
    <div className="publication-node-validation">
      <div className="publication-node-metrics">
        <span className={exceedsTextLimit ? 'publication-node-metric-warning' : undefined}>{messageLength}/{messageCharacterLimit}</span>
        <span>{imageCount}/{TELEGRAM_MAX_MEDIA_ITEMS} media</span>
        <span>{validation.metrics.hashtagCount} tag</span>
      </div>
      {validation.issues.length > 0 || mediaOverflow || exceedsTextLimit ? (
        <div className="publication-node-issues">
          {exceedsTextLimit ? (
            <div className="publication-node-issue publication-node-issue-warning">
              Текст превысил лимит Telegram на {messageLength - messageCharacterLimit} символов. Лишнее будет обрезано перед публикацией.
            </div>
          ) : null}
          {mediaOverflow ? (
            <div className="publication-node-issue publication-node-issue-error">
              Telegram supports up to {TELEGRAM_MAX_MEDIA_ITEMS} media items in one album.
            </div>
          ) : null}
          {validation.issues.slice(0, 3).map((issue) => (
            <div key={issue.id} className={`publication-node-issue publication-node-issue-${issue.severity}`}>
              {issue.message}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
