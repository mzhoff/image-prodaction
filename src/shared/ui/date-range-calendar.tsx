'use client';
import { useUiCatalog } from '@/shared/i18n/use-ui-catalog';
import { useFormatLocale } from '@/shared/i18n/use-format-locale';
import { useTranslations } from '@/shared/i18n/use-translations';

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from '@prodactionpro/ui-core/icons';
import { calendarMonthCells, calendarMonthRange, calendarMonthStart, calendarRangeDays, calendarRangeError, orderedCalendarRange, shiftCalendarDay, shiftCalendarMonth, type CalendarRange } from './date-range-calendar-model';
import './date-range-calendar.css';

const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const date = (day: string) => new Date(`${day}T00:00:00Z`);

/** One shared calendar with draft selection, keyboard navigation and native focus containment. */
export function DateRangeCalendar({ value, maxDate, maxDays = 366, anchorRef, onApply, onClose }: {
  value: CalendarRange; maxDate: string; maxDays?: number; anchorRef: RefObject<HTMLButtonElement | null>;
  onApply: (range: CalendarRange) => void; onClose: () => void;
}) {
  const tUi = useTranslations();
  const language = useFormatLocale();
  const monthLabel = new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const dayLabel = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const ui_weekdays = useUiCatalog(weekdays, tUi);
  const [draft, setDraft] = useState(value);
  const [firstMonth, setFirstMonth] = useState(() => shiftCalendarMonth(calendarMonthStart(value.to > maxDate ? maxDate : value.to), -2));
  const [selectingEnd, setSelectingEnd] = useState(false);
  const [hoverDay, setHoverDay] = useState<string | null>(null);
  const [focusedDay, setFocusedDay] = useState(value.to <= maxDate ? value.to : maxDate);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const error = calendarRangeError(draft, maxDate, maxDays);
  const preview = selectingEnd && hoverDay ? orderedCalendarRange(draft.from, hoverDay) : draft;
  const months = [0, 1, 2].map((n) => shiftCalendarMonth(firstMonth, n));
  const canNext = months[2] < calendarMonthStart(maxDate);

  useLayoutEffect(() => {
    const dialog = dialogRef.current, trigger = anchorRef.current;
    if (!dialog) return;
    dialog.showModal();
    function position() {
      if (!dialog) return;
      const anchor = trigger?.getBoundingClientRect(), rect = dialog.getBoundingClientRect();
      const below = (anchor?.bottom ?? 0) + 10;
      const top = below + rect.height <= window.innerHeight - 12 ? below : Math.max(12, (anchor?.top ?? window.innerHeight) - rect.height - 10);
      dialog.style.top = `${top}px`;
      dialog.style.left = `${Math.max(12, Math.min(anchor?.left ?? 12, window.innerWidth - rect.width - 12))}px`;
    }
    position();
    dialog.querySelector<HTMLElement>('[data-calendar-focus]')?.focus({ preventScroll: true });
    window.addEventListener('resize', position);
    return () => { window.removeEventListener('resize', position); dialog.close(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, [anchorRef]);
  useEffect(() => {
    if (keyboardFocus) dialogRef.current?.querySelector<HTMLElement>(`[data-day="${focusedDay}"]`)?.focus({ preventScroll: true });
  }, [focusedDay, firstMonth, keyboardFocus]);

  function select(day: string) {
    setDraft(selectingEnd ? orderedCalendarRange(draft.from, day) : { from: day, to: day });
    setSelectingEnd(!selectingEnd); setHoverDay(null); setFocusedDay(day); setKeyboardFocus(false);
  }
  function selectMonth(month: string) { setDraft(calendarMonthRange(month, maxDate)); setSelectingEnd(false); setHoverDay(null); }
  function enterDate(field: keyof CalendarRange, value: string) {
    setDraft((current) => ({ ...current, [field]: value })); setSelectingEnd(false); setHoverDay(null);
  }
  function navigate(count: number) {
    const next = shiftCalendarMonth(firstMonth, count);
    setFirstMonth(next); setFocusedDay(next); setKeyboardFocus(false);
  }
  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, day: string) {
    const weekday = (date(day).getUTCDay() + 6) % 7;
    const movement: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -weekday, End: 6 - weekday };
    let next: string;
    if (event.key in movement) next = shiftCalendarDay(day, movement[event.key]);
    else if (event.key === 'PageUp' || event.key === 'PageDown') next = shiftCalendarMonth(day, event.key === 'PageUp' ? -1 : 1);
    else return;
    event.preventDefault();
    if (next > maxDate) next = maxDate;
    if (next < firstMonth) setFirstMonth(calendarMonthStart(next));
    else if (next >= shiftCalendarMonth(firstMonth, 3)) setFirstMonth(shiftCalendarMonth(calendarMonthStart(next), -2));
    setFocusedDay(next); setKeyboardFocus(true);
  }
  return createPortal(<dialog className="date-range-calendar" ref={dialogRef} aria-label={tUi("Выбор диапазона дат")}
    onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="date-range-calendar-surface">
      <div className="date-range-calendar-navigation">
        <button type="button" aria-label={tUi("Предыдущий месяц")} onClick={() => navigate(-1)}><ChevronLeft size={18} /></button>
        <span>{tUi("Выберите период")}</span>
        <button type="button" aria-label={tUi("Следующий месяц")} disabled={!canNext} onClick={() => navigate(1)}><ChevronRight size={18} /></button>
      </div>
      <div className="date-range-calendar-months" onMouseLeave={() => setHoverDay(null)}>
        {months.map((month) => <section key={month} className="date-range-calendar-month" aria-label={monthLabel.format(date(month))}>
          <button className="date-range-calendar-month-title" type="button" aria-label={tUi("Выбрать весь {p1}", { p1: monthLabel.format(date(month)) })} onClick={() => selectMonth(month)}>{monthLabel.format(date(month))}</button>
          <div className="date-range-calendar-grid">
            {ui_weekdays.map((day, index) => <span className="date-range-calendar-weekday" data-weekend={index > 4 || undefined} key={day}>{day}</span>)}
            {calendarMonthCells(month).map((day, index) => day ? <button key={day} type="button" data-day={day} aria-label={dayLabel.format(date(day))}
              disabled={day > maxDate} aria-pressed={day >= draft.from && day <= draft.to} aria-current={day === maxDate ? 'date' : undefined}
              tabIndex={day === focusedDay ? 0 : -1} data-calendar-focus={day === focusedDay || undefined}
              data-in-range={day >= preview.from && day <= preview.to || undefined} data-range-start={day === preview.from || undefined} data-range-end={day === preview.to || undefined}
              data-weekend={index % 7 > 4 || undefined} onMouseEnter={() => setHoverDay(day <= maxDate ? day : null)} onKeyDown={(event) => moveFocus(event, day)} onClick={() => select(day)}>{Number(day.slice(-2))}</button>
              : <span key={`empty-${index}`} />)}
          </div>
        </section>)}
      </div>
      <div className="date-range-calendar-footer">
        <div className="date-range-calendar-inputs">
          <input aria-label={tUi("Начало периода")} type="date" max={maxDate} value={draft.from} onInput={(e) => enterDate('from', e.currentTarget.value)} onChange={(e) => enterDate('from', e.target.value)} />
          <span aria-hidden="true">—</span>
          <input aria-label={tUi("Конец периода")} type="date" max={maxDate} value={draft.to} onInput={(e) => enterDate('to', e.currentTarget.value)} onChange={(e) => enterDate('to', e.target.value)} />
          {!error ? <span className="date-range-calendar-count">{calendarRangeDays(draft)}  {' '}{tUi("дн.")}</span> : null}
        </div>
        <div className="date-range-calendar-actions"><button type="button" onClick={onClose}>{tUi("Отмена")}</button><button type="button" disabled={!!error} onClick={() => { if (!error) onApply(draft); }}>{tUi("Применить")}</button></div>
        {error ? <p className="date-range-calendar-error" role="alert">{typeof (error) === 'string' ? tUi((error) as string) : (error)}</p> : null}
      </div>
    </div>
  </dialog>, document.body);
}
