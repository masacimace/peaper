import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './ui/Button';
import { cn } from './ui/cn';

export function Dialog({
  title,
  children,
  onClose,
  className,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => {
    ref.current?.showModal();
    ref.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, []);
  const content = (
    <dialog
      ref={ref}
      className={cn(
        'm-auto w-[min(460px,calc(100vw-32px))] rounded-[8px] border border-border-strong bg-surface-overlay p-6 text-foreground shadow-dialog backdrop:bg-scrim',
        className,
      )}
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mb-3.25 flex items-center justify-between gap-3.75">
        <h2 id={headingId} className="text-title font-medium tracking-[-0.4px] text-strong">
          {title}
        </h2>
        <IconButton aria-label="Close dialog" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
  return typeof document === 'undefined' ? content : createPortal(content, document.body);
}
