import { useEffect, useId, useRef, useState } from 'react';
import { formatDateLong } from '../../core/format';
import { rapportComplete } from '../../core/sync';
import type { Rapport } from '../../core/types';
import { useApp } from '../../store/appStore';
import { Dialog } from '../../ui/components';
import { useSettings, useT } from '../../ui/hooks';

/**
 * Inline day note (home screen). Saves when the field loses focus, so typing
 * never writes on every keystroke; an empty field removes the note.
 */
export function DayNoteField({ date, label }: { date: string; label: string }) {
  const t = useT();
  const id = useId();
  const stored = useApp((s) => s.dayNotes[date]?.text ?? '');
  const setDayNote = useApp((s) => s.setDayNote);
  const [text, setText] = useState(stored);
  const [saved, setSaved] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  // Follow external changes (other day after midnight, restore, edit in History).
  useEffect(() => setText(stored), [stored, date]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const save = async () => {
    if (text.trim() === stored) return;
    await setDayNote(date, text);
    setSaved(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="field day-note-field">
      <label htmlFor={id}>
        {label}
        {saved && (
          <span className="saved" role="status">
            {' '}
            · {t('daynote.saved')}
          </span>
        )}
      </label>
      <textarea
        id={id}
        rows={2}
        value={text}
        placeholder={t('daynote.placeholder')}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void save()}
      />
    </div>
  );
}

/**
 * Asked on punch out until the day has both answers: where was the work done,
 * and were there Rapport hours? Punching out is only possible with both.
 */
export function PunchOutDialog({
  date,
  open,
  onCancel,
  onConfirm,
}: {
  date: string;
  open: boolean;
  onCancel: () => void;
  onConfirm: (text: string, rapport: Rapport) => void;
}) {
  const t = useT();
  const stored = useApp((s) => s.dayNotes[date]);
  const [text, setText] = useState('');
  const [done, setDone] = useState<boolean | null>(null);
  const [hours, setHours] = useState('');
  const [what, setWhat] = useState('');

  // Picks up a note that was still being saved from the home screen field.
  useEffect(() => {
    if (!open) return;
    setText((cur) => (cur.trim() === '' ? (stored?.text ?? '') : cur));
    const r = stored?.rapport;
    if (r && done === null) {
      setDone(r.done);
      if (r.done) {
        setHours(String(r.hours).replace('.', ','));
        setWhat(r.text);
      }
    }
    // Only on opening and when the stored note arrives, not while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stored]);

  const hoursNum = Number(hours.replace(',', '.'));
  const rapport: Rapport | undefined =
    done === false
      ? { done: false }
      : done
        ? { done: true, hours: hoursNum, text: what }
        : undefined;
  const valid =
    text.trim() !== '' &&
    rapportComplete(rapport) &&
    (!rapport.done || (Number.isFinite(hoursNum) && hoursNum <= 24));

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={t('punchOut.title')}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!valid}
            onClick={() => rapport && onConfirm(text, rapport)}
          >
            {t('punchOut.confirm')}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="punch-out-note">{t('daynote.label')}</label>
        <textarea
          id="punch-out-note"
          rows={3}
          value={text}
          placeholder={t('daynote.placeholder')}
          onChange={(e) => setText(e.target.value)}
        />
        <small className="muted">{t('punchOut.help')}</small>
      </div>

      <fieldset className="field rapport">
        <legend>{t('rapport.question')}</legend>
        {/* Nothing is pre-selected: the answer must be a conscious yes or no. */}
        <div className="choice">
          <button
            type="button"
            className={done === false ? 'active' : undefined}
            aria-pressed={done === false}
            onClick={() => setDone(false)}
          >
            {t('common.no')}
          </button>
          <button
            type="button"
            className={done === true ? 'active' : undefined}
            aria-pressed={done === true}
            onClick={() => setDone(true)}
          >
            {t('common.yes')}
          </button>
        </div>
        {done && (
          <>
            <label htmlFor="rapport-hours">{t('rapport.hours')}</label>
            <input
              id="rapport-hours"
              type="text"
              inputMode="decimal"
              value={hours}
              placeholder="z. B. 1,5"
              onChange={(e) => setHours(e.target.value)}
            />
            <label htmlFor="rapport-what">{t('rapport.what')}</label>
            <textarea
              id="rapport-what"
              rows={2}
              value={what}
              placeholder={t('rapport.whatPlaceholder')}
              onChange={(e) => setWhat(e.target.value)}
            />
          </>
        )}
      </fieldset>
    </Dialog>
  );
}

/** Dialog to add, edit or (by clearing) remove the note of any day. */
export function DayNoteDialog({ date, onClose }: { date: string | null; onClose: () => void }) {
  const t = useT();
  const settings = useSettings();
  const stored = useApp((s) => (date ? (s.dayNotes[date]?.text ?? '') : ''));
  const setDayNote = useApp((s) => s.setDayNote);
  const [text, setText] = useState('');

  useEffect(() => {
    if (date) setText(stored);
  }, [date, stored]);

  const save = async () => {
    if (date) await setDayNote(date, text);
    onClose();
  };

  return (
    <Dialog
      open={date !== null}
      onClose={onClose}
      title={date ? t('daynote.forDay', { date: formatDateLong(date, settings.language) }) : ''}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="day-note-dialog">{t('daynote.label')}</label>
        <textarea
          id="day-note-dialog"
          rows={4}
          value={text}
          placeholder={t('daynote.placeholder')}
          onChange={(e) => setText(e.target.value)}
        />
        <small className="muted">{t('daynote.hint')}</small>
      </div>
    </Dialog>
  );
}
