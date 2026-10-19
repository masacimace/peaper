import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export const errorStyles =
  'border-b border-danger-border bg-danger-soft px-2.5 py-2 text-caption leading-relaxed text-danger';
export function ErrorNotice({
  className,
  role = 'alert',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(errorStyles, className)} role={role} {...props} />;
}
