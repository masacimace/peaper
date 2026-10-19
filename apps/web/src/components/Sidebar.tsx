import type { Health, Workspace } from '@peaper/shared';
import {
  BookOpen,
  Boxes,
  ChevronDown,
  CircleHelp,
  FolderCode,
  Layers3,
  MessageSquare,
  Cpu,
  Plus,
  Settings2,
  type LucideIcon,
} from 'lucide-react';
import { Brand } from './Brand';
import { IconButton } from './ui/Button';
import { StatusDot } from './ui/Status';
import { cn } from './ui/cn';

export type NavigationSection =
  'workspace' | 'sessions' | 'models' | 'skills' | 'memory' | 'integrations' | 'settings';
const navigation: { id: NavigationSection; label: string; icon: LucideIcon }[] = [
  { id: 'workspace', label: 'Workspace', icon: FolderCode },
  { id: 'sessions', label: 'Sessions', icon: MessageSquare },
  { id: 'models', label: 'Models', icon: Cpu },
  { id: 'skills', label: 'Skills', icon: Boxes },
  { id: 'memory', label: 'Memory', icon: BookOpen },
  { id: 'integrations', label: 'Integrations', icon: Layers3 },
];
export function Sidebar({
  workspace,
  health,
  collapsed,
  section,
  sessionCount,
  connected,
  onNavigate,
  onNewSession,
  onDetails,
}: {
  workspace: Workspace;
  health: Health;
  collapsed: boolean;
  section: NavigationSection;
  sessionCount: number;
  connected: boolean;
  onNavigate: (section: NavigationSection) => void;
  onNewSession: () => void;
  onDetails: () => void;
}) {
  const navItem =
    'group relative flex h-8.5 w-full items-center gap-2.5 rounded-sm px-2.25 text-label text-muted hover:bg-surface-hover hover:text-foreground short:h-7.5';
  const labelClass = collapsed ? 'hidden' : undefined;
  const tooltipClass = cn(
    'pointer-events-none absolute top-1.25 left-10.75 z-70 rounded-xs border border-border-strong bg-surface-overlay px-2 py-1 text-label whitespace-nowrap text-foreground opacity-0 shadow-menu group-hover:opacity-100 group-focus-visible:opacity-100',
    !collapsed && 'hidden',
  );
  return (
    <aside
      className={cn(
        'relative z-(--layer-navigation) flex min-h-0 flex-col border-r border-border bg-sidebar px-3',
        collapsed
          ? 'bg-surface-inset px-2'
          : 'max-compact:fixed max-compact:inset-y-0 max-compact:left-0 max-compact:z-(--layer-overlay) max-compact:w-50',
      )}
      data-collapsed={collapsed}
      aria-label="Main navigation"
    >
      <div
        className={cn(
          'flex h-13.75 shrink-0 items-center short:h-11.25',
          collapsed && 'justify-center',
        )}
      >
        <Brand compact={collapsed} />
      </div>
      <button
        className={cn(
          'group relative flex h-8.25 shrink-0 items-center gap-2 rounded-sm border border-border bg-surface-raised px-2.25 text-label shadow-control hover:bg-surface-hover',
          collapsed && 'justify-center px-0',
        )}
        onClick={onNewSession}
        aria-label="New session"
        title="New session (Ctrl+K)"
      >
        <Plus size={17} />
        <span className={labelClass}>New session</span>
        <kbd className={cn('ml-auto font-mono text-mini text-subtle', labelClass)}>Ctrl K</kbd>
        <span className={tooltipClass}>New session</span>
      </button>
      <nav className="mt-4.75 flex flex-col gap-0.75 short:mt-3.25">
        {navigation.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={cn(
              navItem,
              collapsed && 'justify-center px-0',
              section === id && 'bg-surface-selected text-strong',
            )}
            aria-label={label}
            aria-current={section === id ? 'page' : undefined}
            onClick={() => onNavigate(id)}
          >
            <Icon size={17} strokeWidth={1.5} />
            <span className={labelClass}>{label}</span>
            {id === 'sessions' && sessionCount > 0 && (
              <span className={cn('ml-auto text-micro text-subtle', labelClass)}>
                {sessionCount}
              </span>
            )}
            <span className={tooltipClass}>{label}</span>
          </button>
        ))}
        <div className="h-2.25" />
        <button
          className={cn(
            navItem,
            collapsed && 'justify-center px-0',
            section === 'settings' && 'bg-surface-selected text-strong',
          )}
          aria-label="Settings"
          aria-current={section === 'settings' ? 'page' : undefined}
          onClick={() => onNavigate('settings')}
        >
          <Settings2 size={17} strokeWidth={1.5} />
          <span className={labelClass}>Settings</span>
          <span className={tooltipClass}>Settings</span>
        </button>
      </nav>
      <div className="mt-auto pt-8 short:pt-3.75">
        <button
          className={cn(
            'flex items-center gap-2.25 border-y border-border-subtle px-3.25 py-3.25 text-left hover:bg-surface-hover',
            collapsed
              ? '-ml-2 w-[calc(100%+16px)] justify-center py-3.75'
              : '-ml-3 w-[calc(100%+24px)]',
          )}
          onClick={onDetails}
          aria-label="Workspace details"
          title={workspace.path}
        >
          <BoxMark />
          <span className={cn('min-w-0 flex-1', labelClass)}>
            <strong className="block truncate text-label font-medium text-strong">
              {workspace.name}
            </strong>
            <small className="mt-0.75 flex items-center gap-1.25 text-micro text-muted">
              <StatusDot />
              Local workspace
            </small>
          </span>
          <ChevronDown className={cn('text-subtle', labelClass)} size={13} />
        </button>
        <div
          className={cn(
            'mt-2.75 mb-0.5 flex items-center gap-1.75 px-0.5 text-caption text-muted',
            collapsed && 'flex-col gap-2.75 py-3.25',
          )}
        >
          <StatusDot warning={!connected} />
          <span className={cn('flex-1', labelClass)}>
            {connected ? 'Runtime ready' : 'Reconnecting'}
          </span>
          <IconButton aria-label="Runtime details" title="Runtime details" onClick={onDetails}>
            <CircleHelp size={14} />
          </IconButton>
        </div>
        <div
          className={cn(
            'flex flex-col gap-1 px-0.5 pt-1.25 pb-3.5 text-micro text-subtle short:pb-2',
            labelClass,
          )}
        >
          <span>
            {health.node} <span className="mx-1 text-subtle">/</span> {health.platform}
          </span>
          <span>SQLite · FTS5</span>
        </div>
      </div>
    </aside>
  );
}
function BoxMark() {
  return (
    <span className="flex w-6 shrink-0 justify-center text-foreground">
      <FolderCode size={18} strokeWidth={1.4} />
    </span>
  );
}
