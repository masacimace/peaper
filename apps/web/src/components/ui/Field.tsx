import type { InputHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes } from 'react';
import { cn } from './cn';

const control =
  'h-control w-full min-w-0 rounded-sm border border-border bg-surface-inset px-2 text-label text-foreground read-only:text-subtle';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, className)} {...props} />;
}
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, className)} {...props} />;
}
export function Field({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('flex min-w-0 flex-col gap-2 text-label text-muted', className)}
      {...props}
    />
  );
}
