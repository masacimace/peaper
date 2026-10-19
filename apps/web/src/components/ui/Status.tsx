import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export function StatusDot({
  warning = false,
  className,
}: {
  warning?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block size-1.25 shrink-0 rounded-full',
        warning ? 'bg-warning' : 'bg-success',
        className,
      )}
    />
  );
}
export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.25 rounded-sm border border-border-strong px-1.75 py-0.75 text-caption whitespace-nowrap text-muted',
        className,
      )}
      {...props}
    />
  );
}
