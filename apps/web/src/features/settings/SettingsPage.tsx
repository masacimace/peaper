import { useState } from 'react';
import {
  Check,
  ChevronRight,
  Copy,
  Database,
  FolderCode,
  PanelLeft,
  PlugZap,
  RotateCcw,
  TerminalSquare,
} from 'lucide-react';
import type { Health, Workspace } from '@peaper/shared';
import { ThemePicker } from '../../theme/ThemePicker';

export function SettingsPage({
  workspace,
  health,
  onResetLayout,
  onRuntime,
}: {
  workspace: Workspace;
  health: Health;
  onResetLayout: () => void;
  onRuntime: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  return (
    <div className="manager-page settings-page">
      <div className="manager-heading">
        <div>
          <span className="section-kicker">PREFERENCES</span>
          <h1>Settings</h1>
          <p>Your workspace, configured for you.</p>
        </div>
      </div>
      <section className="settings-section">
        <h2>Workspace</h2>
        <div className="setting-row">
          <FolderCode size={17} />
          <span>
            <strong>{workspace.name}</strong>
            <small className="mono">{workspace.path}</small>
          </span>
          <button
            className="icon-button"
            title="Copy workspace path"
            aria-label="Copy workspace path"
            onClick={() => {
              void navigator.clipboard.writeText(workspace.path).then(
                () => {
                  setCopied(true);
                  setCopyError('');
                },
                () => setCopyError('Clipboard access is unavailable in this browser.'),
              );
            }}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
        </div>
        {copyError && (
          <p className="inline-error" role="alert">
            {copyError}
          </p>
        )}
      </section>
      <section className="settings-section">
        <h2>Appearance & layout</h2>
        <ThemePicker />
        <div className="setting-row">
          <PanelLeft size={17} />
          <span>
            <strong>Workspace layout</strong>
            <small>Panel sizes and visibility are saved in this browser for each workspace.</small>
          </span>
          <button className="secondary-button" onClick={onResetLayout}>
            <RotateCcw size={13} />
            Reset
          </button>
        </div>
      </section>
      <section className="settings-section">
        <h2>Model connections</h2>
        <div className="setting-row">
          <PlugZap size={17} />
          <span>
            <strong>No model connected</strong>
            <small>Provider setup and the coding agent are not available in this version.</small>
          </span>
          <span className="small-badge">Not configured</span>
        </div>
      </section>
      <section className="settings-section">
        <h2>Local runtime</h2>
        <div className="setting-row">
          <TerminalSquare size={17} />
          <span>
            <strong>{health.node}</strong>
            <small>{health.platform} · Shell runs with host account permissions.</small>
          </span>
          <button
            className="icon-button"
            title="Runtime details"
            aria-label="Open runtime details"
            onClick={onRuntime}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="setting-row">
          <Database size={17} />
          <span>
            <strong>SQLite + FTS5</strong>
            <small>Schema version {health.database.schemaVersion} · Stored locally</small>
          </span>
          <span className="status-dot" />
        </div>
      </section>
    </div>
  );
}
