import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../store/appStore';
import { useT } from './hooks';
import { Icon } from './icons';

/** Modal built on the native <dialog> element (focus trapping + Esc for free). */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const t = useT();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Click on the backdrop closes.
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="dialog-body">
          <header className="dialog-header">
            <h2 id={titleId}>{title}</h2>
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              aria-label={t('common.close')}
            >
              <Icon name="close" />
            </button>
          </header>
          <div className="dialog-content">{children}</div>
          {footer && <footer className="dialog-footer">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

/** Confirmation dialog; with `requireWord` the user must type a word to enable the action. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger,
  requireWord,
  requireWordPrompt,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  requireWord?: string;
  requireWordPrompt?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [typed, setTyped] = useState('');
  const inputId = useId();
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);
  const enabled = !requireWord || typed.trim().toUpperCase() === requireWord.toUpperCase();
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            disabled={!enabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p>{message}</p>
      {requireWord && (
        <div className="field">
          <label htmlFor={inputId}>{requireWordPrompt}</label>
          <input
            id={inputId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
          />
        </div>
      )}
    </Dialog>
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((x) => (
        <button
          type="button"
          key={x.id}
          className={`toast toast-${x.kind}`}
          onClick={() => dismiss(x.id)}
        >
          {x.message}
        </button>
      ))}
    </div>
  );
}

export function Section({
  title,
  children,
  id,
}: {
  title?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="card" aria-labelledby={id}>
      {title && (
        <h2 className="card-title" id={id}>
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

export function Switch({
  label,
  checked,
  onChange,
  help,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  help?: string;
}) {
  const id = useId();
  return (
    <div className="switch-row">
      <label htmlFor={id} className="switch-label">
        <span>{label}</span>
        {help && <small className="muted">{help}</small>}
      </label>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
}

export function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={String(value)}
        onChange={(e) => {
          const opt = options.find((o) => String(o.value) === e.target.value);
          if (opt) onChange(opt.value);
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Number input that only commits valid values on blur/enter (no jumpy re-formatting while typing). */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  help,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  help?: string;
}) {
  const id = useId();
  const describedBy = [suffix && `${id}-s`, help && `${id}-h`].filter(Boolean).join(' ');
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number(text.replace(',', '.'));
    if (text.trim() === '' || !Number.isFinite(n)) {
      setText(String(value));
      return;
    }
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-suffix">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
          aria-describedby={describedBy || undefined}
          data-step={step}
        />
        {suffix && (
          <span id={`${id}-s`} className="muted">
            {suffix}
          </span>
        )}
      </div>
      {help && (
        <small id={`${id}-h`} className="muted">
          {help}
        </small>
      )}
    </div>
  );
}

/** Text input that commits on blur/enter, like NumberField. */
export function TextField({
  label,
  value,
  onChange,
  help,
  type = 'text',
  autoComplete = 'off',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  help?: string;
  type?: 'text' | 'password';
  autoComplete?: string;
}) {
  const id = useId();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    if (text.trim() !== value) onChange(text.trim());
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={text}
        autoComplete={autoComplete}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        aria-describedby={help ? `${id}-h` : undefined}
      />
      {help && (
        <small id={`${id}-h`} className="muted">
          {help}
        </small>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon name={icon} width={48} height={48} className="empty-icon" />
      <p className="empty-title">{title}</p>
      {hint && <p className="muted">{hint}</p>}
      {action}
    </div>
  );
}
