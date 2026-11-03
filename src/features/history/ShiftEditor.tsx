import { useEffect, useState } from 'react';
import {
  emptyForm,
  formFromShift,
  isNextDay,
  shiftFromForm,
  type ShiftForm,
} from '../../core/edit';
import { formatTime } from '../../core/format';
import { newId } from '../../core/punch';
import { NO_ROUNDING } from '../../core/rounding';
import type { Shift } from '../../core/types';
import { selectActive, useApp } from '../../store/appStore';
import { ConfirmDialog, Dialog } from '../../ui/components';
import { useSettings, useT } from '../../ui/hooks';
import { Icon } from '../../ui/icons';

export function ShiftEditor({
  open,
  shift,
  defaultDate,
  onClose,
}: {
  open: boolean;
  /** undefined = create a new manual entry */
  shift: Shift | undefined;
  defaultDate: string;
  onClose: () => void;
}) {
  const t = useT();
  const settings = useSettings();
  const saveShift = useApp((s) => s.saveShift);
  const removeShift = useApp((s) => s.removeShift);
  const active = useApp(selectActive);
  const [form, setForm] = useState<ShiftForm>(() => emptyForm(defaultDate));
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(shift ? formFromShift(shift) : emptyForm(defaultDate));
    setError(null);
  }, [open, shift, defaultDate]);

  const isRunning = shift?.end === null;
  const patch = (p: Partial<ShiftForm>) => setForm((f) => ({ ...f, ...p }));
  const patchBreak = (i: number, p: Partial<ShiftForm['breaks'][number]>) =>
    setForm((f) => ({ ...f, breaks: f.breaks.map((b, j) => (j === i ? { ...b, ...p } : b)) }));

  const save = async () => {
    const res = shiftFromForm(form, {
      existing: shift,
      rules: NO_ROUNDING,
      applyRounding: false,
      now: Date.now(),
      allowOpen: isRunning,
    });
    if (!res.ok) {
      setError(t(`editor.err.${res.error}`));
      return;
    }
    if (res.shift.end === null && active && active.id !== res.shift.id) {
      setError(t('editor.err.runningExists'));
      return;
    }
    await saveShift(res.shift);
    onClose();
  };

  const nextDayHint = (time: string) =>
    isNextDay(form, time) ? <span className="badge">{t('editor.nextDay')}</span> : null;

  const rawChanged =
    shift &&
    (shift.start.raw !== shift.start.rounded || (shift.end && shift.end.raw !== shift.end.rounded));

  return (
    <>
      <Dialog
        open={open && !confirmDelete}
        onClose={onClose}
        title={shift ? t('editor.titleEdit') : t('editor.titleNew')}
        footer={
          <>
            {shift && (
              <button
                type="button"
                className="btn btn-danger-text"
                onClick={() => setConfirmDelete(true)}
              >
                <Icon name="trash" width={18} height={18} /> {t('common.delete')}
              </button>
            )}
            <span className="spacer" />
            <button type="button" className="btn" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void save()}>
              {t('common.save')}
            </button>
          </>
        }
      >
        <form
          className="editor"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="field">
            <label htmlFor="ed-date">{t('editor.date')}</label>
            <input
              id="ed-date"
              type="date"
              value={form.date}
              required
              onChange={(e) => patch({ date: e.target.value })}
            />
          </div>
          <div className="row-2">
            <div className="field">
              <label htmlFor="ed-start">{t('editor.start')}</label>
              <input
                id="ed-start"
                type="time"
                value={form.start}
                required
                onChange={(e) => patch({ start: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="ed-end">
                {t('editor.end')} {nextDayHint(form.end)}
              </label>
              <input
                id="ed-end"
                type="time"
                value={form.end}
                required={!isRunning}
                placeholder={isRunning ? t('editor.endEmpty') : undefined}
                onChange={(e) => patch({ end: e.target.value })}
              />
              {isRunning && form.end === '' && (
                <small className="muted">{t('editor.endEmpty')}</small>
              )}
            </div>
          </div>
          {rawChanged && shift && (
            <p className="muted small">
              {t('editor.rawInfo', {
                start: formatTime(shift.start.raw, settings.timeFormat),
                end: shift.end ? formatTime(shift.end.raw, settings.timeFormat) : '…',
              })}
            </p>
          )}

          <fieldset className="breaks">
            <legend>{t('editor.breaks')}</legend>
            {form.breaks.map((b, i) => (
              <div className="break-row" key={b.id}>
                <div className="field">
                  <label htmlFor={`ed-bs-${i}`}>
                    {t('editor.breakFrom')} {nextDayHint(b.start)}
                  </label>
                  <input
                    id={`ed-bs-${i}`}
                    type="time"
                    value={b.start}
                    onChange={(e) => patchBreak(i, { start: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`ed-be-${i}`}>
                    {t('editor.breakTo')} {nextDayHint(b.end)}
                  </label>
                  <input
                    id={`ed-be-${i}`}
                    type="time"
                    value={b.end}
                    onChange={(e) => patchBreak(i, { end: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t('editor.removeBreak')}
                  onClick={() =>
                    setForm((f) => ({ ...f, breaks: f.breaks.filter((_, j) => j !== i) }))
                  }
                >
                  <Icon name="trash" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-small"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  breaks: [...f.breaks, { id: newId(), start: '12:00', end: '12:30' }],
                }))
              }
            >
              <Icon name="plus" width={18} height={18} /> {t('editor.addBreak')}
            </button>
          </fieldset>

          <div className="field">
            <label htmlFor="ed-note">{t('editor.note')}</label>
            <textarea
              id="ed-note"
              rows={2}
              value={form.note}
              onChange={(e) => patch({ note: e.target.value })}
            />
          </div>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {/* Lets "Go"/Enter on mobile keyboards submit the form. */}
          <button type="submit" hidden />
        </form>
      </Dialog>
      <ConfirmDialog
        open={open && confirmDelete}
        title={t('common.delete')}
        message={t('editor.confirmDelete')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => {
          setConfirmDelete(false);
          if (shift) void removeShift(shift.id);
          onClose();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
