import type { LucideIcon } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export function EmptyState({
  className,
  icon: Icon,
  iconSize = 25,
  title,
  description,
  children,
  variant = 'panel',
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  icon?: LucideIcon;
  iconSize?: number;
  title?: ReactNode;
  description?: ReactNode;
  variant?: 'panel' | 'page';
}) {
  return (
    <div
      className={cn(
        'm-auto max-w-80 px-4.25 py-6.25 text-center text-subtle',
        variant === 'page' &&
          'mx-auto my-0 max-w-95 px-5 py-13 max-compact:px-2 max-compact:py-11.25',
        className,
      )}
      {...props}
    >
      {Icon && (
        <Icon
          size={iconSize}
          strokeWidth={1.2}
          className={cn('mx-auto mb-3.25 block', variant === 'page' && 'mb-5')}
        />
      )}
      {title &&
        (variant === 'page' ? (
          <h2 className="text-[16px] font-[450] tracking-[-0.3px] text-foreground">{title}</h2>
        ) : (
          <h3 className="text-small font-[450] text-foreground">{title}</h3>
        ))}
      {description && (
        <p
          className={cn(
            'mt-2 mb-3 text-caption leading-[1.8]',
            variant === 'page' && 'mt-2.5 mb-5 text-label',
          )}
        >
          {description}
        </p>
      )}
      {children}
    </div>
  );
}
export function LoadingState({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex size-full items-center justify-center bg-editor p-5 text-caption text-subtle',
        className,
      )}
      {...props}
    />
  );
}
