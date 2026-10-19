import type { Health } from '@peaper/shared';
import { Check, Database, Monitor, ShieldCheck, TerminalSquare } from 'lucide-react';
import { Dialog } from '../../components/Dialog';

export function RuntimeDialog({ health, onClose }: { health: Health; onClose: () => void }) {
  const details = [
    { label: 'Runtime', icon: Monitor, value: `${health.node} · ${health.platform}` },
    {
      label: 'Storage',
      icon: Database,
      value: (
        <>
          SQLite / FTS5 <Check size={14} className="text-success" />
        </>
      ),
    },
    { label: 'Schema', value: `Version ${health.database.schemaVersion}` },
    {
      label: 'Shell',
      icon: TerminalSquare,
      value: <span className="font-mono">{health.terminal.shell.split(/[\\/]/).pop()}</span>,
    },
    { label: 'Execution', icon: ShieldCheck, value: 'Host permissions' },
    { label: 'Version', value: health.version },
  ];
  return (
    <Dialog title="Your local runtime" onClose={onClose}>
      <p className="text-label leading-[1.8] text-muted">
        Running on this computer. Workspace data stays in your local database.
      </p>
      <dl className="my-5">
        {details.map(({ label, icon: Icon, value }) => (
          <div
            key={label}
            className="flex justify-between gap-3.5 border-b border-border-subtle py-2.75 text-label"
          >
            <dt className="flex items-center gap-2 text-muted">
              {Icon && <Icon size={16} />}
              {label}
            </dt>
            <dd className="flex items-center gap-1.75 text-right wrap-anywhere">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="rounded-sm border border-success bg-success-soft px-3.25 py-2.75 text-caption leading-[1.7] text-success">
        The terminal uses your local account permissions. OS sandbox isolation is not enabled.
      </div>
    </Dialog>
  );
}
