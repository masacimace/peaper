import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'text';
const variants: Record<Variant, string> = {
  primary:
    'border-accent bg-accent text-accent-foreground hover:enabled:border-accent-hover hover:enabled:bg-accent-hover',
  secondary:
    'border-border-strong bg-surface-raised text-foreground hover:enabled:bg-surface-hover',
  text: 'min-h-0 gap-1.75 border-0 bg-transparent px-1.75 py-1.25 font-normal text-muted hover:enabled:bg-surface-hover hover:enabled:text-foreground',
};

export function Button({
  variant = 'secondary',
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex min-h-control shrink-0 items-center justify-center gap-2 rounded-sm border px-3 py-1.5 text-label font-medium whitespace-nowrap',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export const iconButtonStyles =
  'inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted hover:enabled:bg-surface-hover hover:enabled:text-foreground';

export function IconButton({
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { 'aria-label': string }) {
  return <button type={type} className={cn(iconButtonStyles, className)} {...props} />;
}
