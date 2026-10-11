import { useEffect, useId, useRef, type ReactNode } from 'react';
import s from './Dialog.module.css';

export function Dialog({ title, busy, onClose, children }: { title: string; busy: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>('[data-autofocus], input')?.focus();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  return <dialog ref={ref} className={s.dialog} aria-labelledby={titleId} onCancel={event => {
    event.preventDefault();
    if (!busy) onClose();
  }}>
    <div className={s.header}><h2 id={titleId}>{title}</h2><button type="button" aria-label="Close dialog" disabled={busy} onClick={onClose}>×</button></div>
    {children}
  </dialog>;
}
