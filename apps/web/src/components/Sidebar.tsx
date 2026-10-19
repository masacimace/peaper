import {
  BookOpen,
  Boxes,
  ChevronDown,
  CircleHelp,
  FolderCode,
  Layers3,
  MessageSquare,
  Plus,
  Settings2,
  type LucideIcon,
} from 'lucide-react';
import type { Health, Workspace } from '@peaper/shared';
import { Brand } from './Brand';

export type NavigationSection =
  'workspace' | 'sessions' | 'skills' | 'memory' | 'integrations' | 'settings';
const navigation: { id: NavigationSection; label: string; icon: LucideIcon }[] = [
  { id: 'workspace', label: 'Workspace', icon: FolderCode },
  { id: 'sessions', label: 'Sessions', icon: MessageSquare },
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
  return (
    <aside className="navigation" data-collapsed={collapsed} aria-label="Main navigation">
      <div className="nav-brand">
        <Brand compact={collapsed} />
      </div>
      <button
        className="new-session-button"
        onClick={onNewSession}
        aria-label="New session"
        title="New session (Ctrl+K)"
      >
        <Plus size={17} />
        <span className="nav-label">New session</span>
        <kbd className="nav-label">Ctrl K</kbd>
        <span className="nav-tooltip">New session</span>
      </button>
      <nav className="nav-links">
        {navigation.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`nav-item ${section === id ? 'active' : ''}`}
            aria-label={label}
            aria-current={section === id ? 'page' : undefined}
            onClick={() => onNavigate(id)}
          >
            <Icon size={17} strokeWidth={1.5} />
            <span className="nav-label">{label}</span>
            {id === 'sessions' && sessionCount > 0 && (
              <span className="nav-count nav-label">{sessionCount}</span>
            )}
            <span className="nav-tooltip">{label}</span>
          </button>
        ))}
        <div className="nav-spacer" />
        <button
          className={`nav-item ${section === 'settings' ? 'active' : ''}`}
          aria-label="Settings"
          aria-current={section === 'settings' ? 'page' : undefined}
          onClick={() => onNavigate('settings')}
        >
          <Settings2 size={17} strokeWidth={1.5} />
          <span className="nav-label">Settings</span>
          <span className="nav-tooltip">Settings</span>
        </button>
      </nav>
      <div className="nav-bottom">
        <button
          className="workspace-switch"
          onClick={onDetails}
          aria-label="Workspace details"
          title={workspace.path}
        >
          <BoxMark />
          <span className="nav-label">
            <strong>{workspace.name}</strong>
            <small>
              <i className="status-dot" />
              Local workspace
            </small>
          </span>
          <ChevronDown className="nav-label" size={13} />
        </button>
        <div className="nav-runtime">
          <span className={`status-dot ${connected ? '' : 'warning-dot'}`} />
          <span className="nav-label">{connected ? 'Runtime ready' : 'Reconnecting'}</span>
          <button
            className="icon-button"
            aria-label="Runtime details"
            title="Runtime details"
            onClick={onDetails}
          >
            <CircleHelp size={14} />
          </button>
        </div>
        <div className="nav-system nav-label">
          <span>
            {health.node} <span className="dim">/</span> {health.platform}
          </span>
          <span>SQLite · FTS5</span>
        </div>
      </div>
    </aside>
  );
}
function BoxMark() {
  return (
    <span className="workspace-mark">
      <FolderCode size={18} strokeWidth={1.4} />
    </span>
  );
}
