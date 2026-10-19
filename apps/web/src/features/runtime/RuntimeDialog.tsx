import type { Health } from '@peaper/shared';
import { Check, Monitor, Database, TerminalSquare, ShieldCheck } from 'lucide-react';
import { Dialog } from '../../components/Dialog';

export function RuntimeDialog({ health, onClose }: { health: Health; onClose: () => void }) {
  return (
    <Dialog title="Your local runtime" onClose={onClose}>
      <p className="muted">
        Running on this computer. Workspace data stays in your local database.
      </p>
      <dl className="runtime-details">
        <div>
          <dt>
            <Monitor size={16} />
            Runtime
          </dt>
          <dd>
            {health.node} · {health.platform}
          </dd>
        </div>
        <div>
          <dt>
            <Database size={16} />
            Storage
          </dt>
          <dd>
            SQLite / FTS5 <Check size={14} />
          </dd>
        </div>
        <div>
          <dt>Schema</dt>
          <dd>Version {health.database.schemaVersion}</dd>
        </div>
        <div>
          <dt>
            <TerminalSquare size={16} />
            Shell
          </dt>
          <dd className="mono">{health.terminal.shell.split(/[\\/]/).pop()}</dd>
        </div>
        <div>
          <dt>
            <ShieldCheck size={16} />
            Execution
          </dt>
          <dd>Host permissions</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>{health.version}</dd>
        </div>
      </dl>
      <div className="subtle-notice">
        The terminal uses your local account permissions. OS sandbox isolation is not enabled.
      </div>
    </Dialog>
  );
}
