import { useEffect, useRef } from 'react';
import {
  Check,
  Columns3,
  FolderTree,
  MessageSquare,
  Monitor,
  RotateCcw,
  TerminalSquare,
} from 'lucide-react';
import type { PanelId, WorkspaceLayout } from './layout';

const items = [
  { id: 'files', label: 'Files', icon: FolderTree },
  { id: 'agent', label: 'Agent', icon: MessageSquare },
  { id: 'terminal', label: 'Terminal', icon: TerminalSquare },
  { id: 'preview', label: 'Preview', icon: Monitor },
] as const;
export function PanelMenu({
  open,
  setOpen,
  layout,
  onToggle,
  onReset,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  layout: WorkspaceLayout;
  onToggle: (id: PanelId) => void;
  onReset: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open, setOpen]);
  return (
    <div className="panel-menu" ref={ref}>
      <button
        className={`toolbar-button ${open ? 'active' : ''}`}
        aria-label="Panels"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
      >
        <Columns3 size={14} />
        <span>Panels</span>
      </button>
      {open && (
        <div className="dropdown-menu" role="menu" aria-label="Workspace panels">
          <span className="dropdown-caption">WORKSPACE LAYOUT</span>
          {items.map(({ id, label, icon: Icon }) => (
            <button
              role="menuitemcheckbox"
              aria-checked={layout.visible[id]}
              key={id}
              onClick={() => onToggle(id)}
            >
              <Icon size={15} />
              <span>{label}</span>
              {layout.visible[id] && <Check size={13} />}
            </button>
          ))}
          <div className="menu-divider" />
          <button
            role="menuitem"
            onClick={() => {
              onReset();
              setOpen(false);
            }}
          >
            <RotateCcw size={14} />
            <span>Reset layout</span>
          </button>
        </div>
      )}
    </div>
  );
}
