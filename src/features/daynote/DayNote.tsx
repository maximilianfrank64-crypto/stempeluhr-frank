import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { recentAddresses } from '../../core/addresses';
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
 * Address of the job site, free text. The app only records it; the office workflow
 * looks it up and compares it with the GPS. Below the field: the addresses this phone
 * used most recently, one tap to use one again (no shared or predefined list).
 */
export function AddressInput({
  value,
  onChange,
  onPick,
  onBlur,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  /** A recent address was tapped (defaults to onChange). */
  onPick?: (v: string) => void;
  onBlur?: () => void;
  id: string;
}) {
  const t = useT();
  const dayNotes = useApp((s) => s.dayNotes);
  const recent = useMemo(() => recentAddresses(dayNotes), [dayNotes]);
  return (
    <div className="field address-field">
      <label htmlFor={id}>{t('address.label')}</label>
      {recent.length > 0 && (
        <div className="chips" role="group" aria-label={t('address.recent')}>
          {recent.map((a) => (
            <button
              key={a}
              type="button"
              className={a === value.trim() ? 'chip active' : 'chip'}
              aria-pressed={a === value.trim()}
              onClick={() => (onPick ?? onChange)(a)}
            >
              {a}
            </button>
          ))}
        </div>
      )}
      <input
        id={id}
        type="text"
        autoComplete="street-address"
        value={value}
        placeholder={t('address.placeholder')}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </div>
  );
}

/** Address of the day on the home screen; saves when the field loses focus. */
export function DayAddressField({ date }: { date: string }) {
  const id = useId();
  const stored = useApp((s) => s.dayNotes[date]?.address ?? '');
  const setDayNote = useApp((s) => s.setDayNote);
  const [value, setValue] = useState(stored);
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => setValue(stored), [stored, date]);

  const saveValue = (raw: string) => {
    const v = raw.trim();
    if (v !== stored) {
      void setDayNote(date, useApp.getState().dayNotes[date]?.text ?? '', undefined, v);
    }
  };

  return (
    <AddressInput
      id={id}
      value={value}
      onChange={setValue}
      onPick={(v) => {
        setValue(v);
        saveValue(v);
      }}
      onBlur={() => saveValue(latest.current)}
    />
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
  onConfirm: (text: string, rapport: Rapport, address: string) => void;
}) {
  const t = useT();
  const stored = useApp((s) => s.dayNotes[date]);
  const [text, setText] = useState('');
  const [address, setAddress] = useState('');
  const [done, setDone] = useState<boolean | null>(null);
  const [hours, setHours] = useState('');
  const [what, setWhat] = useState('');

  const reset = () => {
    setText('');
    setAddress('');
    setDone(null);
    setHours('');
    setWhat('');
  };

  // A new day always starts with an empty report: nothing is carried over from yesterday.
  useEffect(reset, [date]);

  // Picks up a note that was still being saved from the home screen field.
  useEffect(() => {
    if (!open) return;
    setText((cur) => (cur.trim() === '' ? (stored?.text ?? '') : cur));
    setAddress((cur) => (cur.trim() === '' ? (stored?.address ?? '') : cur));
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
            onClick={() => {
              if (!rapport) return;
              onConfirm(text, rapport, address.trim());
              // The dialog stays mounted: clear it so tomorrow's report starts empty.
              reset();
            }}
          >
            {t('punchOut.confirm')}
          </button>
        </>
      }
    >
      <AddressInput id="punch-out-address" value={address} onChange={setAddress} />

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
