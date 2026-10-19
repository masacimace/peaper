import { Maximize2, Minimize2, X, type LucideIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { IconButton } from '../components/ui/Button';
import { cn } from '../components/ui/cn';

export function Panel({
  title,
  icon: Icon,
  children,
  actions,
  hidden,
  style,
  className = '',
  maximized,
  onMaximize,
  onClose,
  header,
  headerClassName,
}: {
  title: string;
  icon?: LucideIcon;
  children: ReactNode;
  actions?: ReactNode;
  hidden?: boolean;
  style?: CSSProperties;
  className?: string;
  maximized?: boolean;
  onMaximize?: () => void;
  onClose?: () => void;
  header?: ReactNode;
  headerClassName?: string;
}) {
  return (
    <section
      className={cn('flex min-h-0 min-w-0 flex-col overflow-hidden bg-editor', className)}
      hidden={hidden}
      style={style}
      aria-label={title}
    >
      <header
        className={cn(
          'flex h-panel-header min-h-panel-header items-center justify-between gap-1.25 border-b border-border-subtle bg-surface-header pr-1.5 pl-3',
          headerClassName,
        )}
      >
        {header || (
          <span className="flex items-center gap-1.75 text-caption font-medium">
            {Icon && <Icon size={13} className="text-muted" />}
            {title}
          </span>
        )}
        <div className="flex shrink-0 items-center gap-px [&_a]:size-5.5 [&_button]:size-5.5">
          {actions}
          {onMaximize && (
            <IconButton
              title={maximized ? `Restore ${title}` : `Expand ${title}`}
              aria-label={maximized ? `Restore ${title}` : `Expand ${title}`}
              onClick={onMaximize}
            >
              {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </IconButton>
          )}
          {onClose && (
            <IconButton title={`Hide ${title}`} aria-label={`Hide ${title}`} onClick={onClose}>
              <X size={14} />
            </IconButton>
          )}
        </div>
      </header>
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}
