import { Maximize2, Minimize2, X, type LucideIcon } from 'lucide-react';
import type { ReactNode, CSSProperties } from 'react';

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
}) {
  return (
    <section className={`panel ${className}`} hidden={hidden} style={style} aria-label={title}>
      <header className="panel-header">
        {header || (
          <span className="panel-title">
            {Icon && <Icon size={13} />}
            {title}
          </span>
        )}
        <div className="panel-actions">
          {actions}
          {onMaximize && (
            <button
              className="icon-button"
              title={maximized ? `Restore ${title}` : `Expand ${title}`}
              aria-label={maximized ? `Restore ${title}` : `Expand ${title}`}
              onClick={onMaximize}
            >
              {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          )}
          {onClose && (
            <button
              className="icon-button"
              title={`Hide ${title}`}
              aria-label={`Hide ${title}`}
              onClick={onClose}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}
