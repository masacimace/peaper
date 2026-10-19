import {
  Check,
  Columns3,
  FolderTree,
  MessageSquare,
  Monitor,
  RotateCcw,
  TerminalSquare,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '../components/ui/cn';
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
  const menuItem =
    'flex w-full items-center gap-2.25 rounded-xs px-2 py-1.75 text-label text-muted hover:bg-surface-hover hover:text-foreground';
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open, setOpen]);
  return (
    <div className="relative" ref={ref}>
      <button
        className={cn(
          'inline-flex items-center gap-1.5 rounded-xs px-1.5 py-0.75 text-caption text-muted hover:bg-surface-hover hover:text-foreground max-compact:p-1',
          open && 'bg-surface-hover text-foreground',
        )}
        aria-label="Panels"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
      >
        <Columns3 size={14} />
        <span className="max-compact:hidden">Panels</span>
      </button>
      {open && (
        <div
          className="absolute top-7.5 right-0 z-(--layer-menu) w-51.5 rounded-[5px] border border-border-strong bg-surface-overlay p-1.25 shadow-menu"
          role="menu"
          aria-label="Workspace panels"
        >
          <span className="block px-2 pt-1.75 pb-2.25 text-mini tracking-[1px] text-subtle">
            WORKSPACE LAYOUT
          </span>
          {items.map(({ id, label, icon: Icon }) => (
            <button
              className={menuItem}
              role="menuitemcheckbox"
              aria-checked={layout.visible[id]}
              key={id}
              onClick={() => onToggle(id)}
            >
              <Icon size={15} />
              <span className="flex-1 text-left">{label}</span>
              {layout.visible[id] && <Check size={13} />}
            </button>
          ))}
          <div className="my-1 h-px bg-border-subtle" />
          <button
            className={menuItem}
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
