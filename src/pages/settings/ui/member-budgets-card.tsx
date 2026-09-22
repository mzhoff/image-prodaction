'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { Button } from '@prodactionpro/ui-core/button';

import { useCallback, useEffect, useState } from 'react';
import type {
  MemberBudgetData,
  MemberBudgetPolicy,
  MemberBudgetRow,
} from '@/modules/workspace-budgets/contracts/member-budget';
import { MemberBudgetForm } from './member-budget-form';
import styles from './member-budgets.module.css';

export function MemberBudgetsCard({
  workspaceId,
  onDirtyChange,
}: {
  workspaceId: string;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const tUi = useTranslations();
  const [data, setData] = useState<MemberBudgetData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setBusy(true);
      setError('');
      try {
        setData(await request(workspaceId, { signal }));
      } catch (error) {
        if (!signal?.aborted) setError(message(error));
      } finally {
        if (!signal?.aborted) setBusy(false);
      }
    },
    [workspaceId],
  );
  useEffect(() => {
    const abort = new AbortController();
    void load(abort.signal);
    return () => abort.abort();
  }, [load]);
  useEffect(() => {
    onDirtyChange(editing !== null);
    return () => onDirtyChange(false);
  }, [editing, onDirtyChange]);
  async function save(member: MemberBudgetRow, policy: Omit<MemberBudgetPolicy, 'mode' | 'revision'>) {
    setBusy(true);
    setError('');
    try {
      setData(
        await request(workspaceId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: member.userId, revision: member.revision, ...policy }),
        }),
      );
      setEditing(null);
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  const selected = data?.members.find(member => member.userId === editing);
  return (
    <section className={`settings-card settings-usage-card ${styles.card}`} aria-labelledby="member-budgets-title">
      <div className="settings-card-head settings-card-head-split">
        <div>
          <h3 id="member-budgets-title">{tUi("Расходы и лимиты участников")}</h3>
          <p>{tUi("Генерации и Ask AI расходуют общий баланс Workspace. Личный лимит не резервирует деньги.")}</p>
        </div>
        <Button size="sm" intent="neutral" appearance="soft"
          className="settings-quiet-button"
          type="button"
          disabled={busy || editing !== null}
          onClick={() => void load()}
        >
          {tUi("Обновить")}</Button>
      </div>
      <p className="settings-provider-usage-note">
        {tUi("В бете новые запросы останавливаются после достижения лимита. Последний запрос может превысить его. Пока стоимость запроса уточняется, новые запуски участника с лимитом приостановлены.")}</p>
      <p className="settings-provider-usage-note">
        {tUi("Изображения и видео — количество запросов к модели. Личный учёт Ask AI начинается с включения этой функции; прежние диалоги остаются в общей статистике.")}</p>
      {busy ? <p role="status">{tUi("Обновляем данные…")}</p> : null}
      {error ? (
        <p className="settings-message settings-message-error" role="alert">
          {typeof (error) === 'string' ? tUi((error) as string) : (error)}
        </p>
      ) : null}
      {data ? (
        <div className="settings-usage-table-wrap">
          <table className={`settings-usage-table ${styles.table}`}>
            <thead>
              <tr>
                <th>{tUi("Участник")}</th>
                <th>{tUi("Расходы / лимит")}</th>
                <th>{tUi("Запросы")}</th>
                <th>{tUi("Токены")}</th>
                <th>{tUi("AI-доступ")}</th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((member) => (
                <MemberRow
                  key={member.userId}
                  member={member}
                  canManage={data.canManage}
                  busy={busy}
                  otherEditing={editing !== null}
                  edit={() => setEditing(member.userId)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {selected && data?.canManage ? <MemberBudgetForm key={`${selected.userId}:${selected.revision}`}
        member={selected} busy={busy} cancel={() => setEditing(null)} save={policy => save(selected, policy)} /> : null}
      {editing ? (
        <p className="settings-provider-usage-note">
          {tUi("Сохраните или отмените изменения перед переключением Workspace.")}</p>
      ) : null}
    </section>
  );
}

function MemberRow({
  member,
  canManage,
  busy,
  otherEditing,
  edit,
}: {
  member: MemberBudgetRow;
  canManage: boolean;
  busy: boolean;
  otherEditing: boolean;
  edit: () => void;
}) {
  const tUi = useTranslations();
  const overrun =
    member.limitUsd === null ? 0 : Math.max(0, Number(member.spentUsd) - Number(member.limitUsd));
  return (
    <>
      <tr>
        <td>
          {member.name}
          <br />
          <small>{member.role ? { owner: tUi("Владелец"), admin: tUi("Администратор"), member: tUi("Участник") }[member.role] : tUi("Бывший участник")}</small>
        </td>
        <td>
          {member.unresolved > 0 ? '≥ ' : ''}{tUi(formatUsd(member.spentUsd))} /{' '}
          {member.limitUsd === null ? tUi("Без лимита") : tUi(formatUsd(member.limitUsd))}
          <br />
          <small>{member.period === 'month' ? tUi("Текущий месяц, UTC") : tUi("За всё время")}</small>
          {overrun > 0 ? <p role="status">{tUi("Превышение:")}{' '} {tUi(formatUsd(overrun))}</p> : null}
          {member.unresolved > 0 ? <p>{tUi("Стоимость уточняется:")}{' '} {member.unresolved}  {' '}{tUi("запр.")}</p> : null}
        </td>
        <td>
          {member.requests}
          <br />
          <small>
            {tUi("Изобр.:")}{' '}{member.images}  {' '}{tUi("· Видео:")}{' '} {member.videos} · Ask AI: {member.assistant}
          </small>
        </td>
        <td>{member.totalTokens}</td>
        <td>
          {member.enabled ? tUi("Включён") : tUi("Отключён")}
          {canManage && member.role ? (
            <p>
              <Button size="sm" intent="neutral" appearance="soft"
                className="settings-quiet-button"
                type="button"
                disabled={busy || otherEditing}
                onClick={edit}
                aria-label={tUi("Изменить лимит: {p1}", { p1: member.name })}
              >
                {tUi("Изменить")}</Button>
            </p>
          ) : null}
        </td>
      </tr>

    </>
  );
}
async function request(workspaceId: string, init: RequestInit) {
  const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/member-budgets`, {
    ...init,
    cache: 'no-store',
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? 'Не удалось обновить лимиты.');
  return body as MemberBudgetData;
}
function message(error: unknown) {
  return error instanceof Error ? error.message : 'Не удалось обновить лимиты.';
}

function formatUsd(value: string | number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 8 }).format(Number(value));
}
