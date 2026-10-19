import type { Health, Workspace } from '@peaper/shared';
import {
  Check,
  ChevronRight,
  Copy,
  Database,
  FolderCode,
  PanelLeft,
  RotateCcw,
  TerminalSquare,
} from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from '../../components/ui/Button';
import { ErrorNotice } from '../../components/ui/Notice';
import { Page, PageHeader, SettingRow, SettingsSection } from '../../components/ui/Page';
import { StatusDot } from '../../components/ui/Status';
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
    <Page>
      <PageHeader
        kicker="PREFERENCES"
        title="Settings"
        description="Your workspace, configured for you."
      />
      <SettingsSection title="Workspace">
        <SettingRow
          icon={FolderCode}
          title={workspace.name}
          description={<span className="font-mono">{workspace.path}</span>}
        >
          <IconButton
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
          </IconButton>
        </SettingRow>
        {copyError && <ErrorNotice role="alert">{copyError}</ErrorNotice>}
      </SettingsSection>
      <SettingsSection title="Appearance & layout">
        <ThemePicker />
        <SettingRow
          icon={PanelLeft}
          title="Workspace layout"
          description="Panel sizes and visibility are saved in this browser for each workspace."
        >
          <Button className="max-compact:px-1.75 max-compact:text-micro" onClick={onResetLayout}>
            <RotateCcw size={13} />
            Reset
          </Button>
        </SettingRow>
      </SettingsSection>
      <SettingsSection title="Local runtime">
        <SettingRow
          icon={TerminalSquare}
          title={health.node}
          description={`${health.platform} · Shell runs with host account permissions.`}
        >
          <IconButton title="Runtime details" aria-label="Open runtime details" onClick={onRuntime}>
            <ChevronRight size={16} />
          </IconButton>
        </SettingRow>
        <SettingRow
          icon={Database}
          title="SQLite + FTS5"
          description={`Schema version ${health.database.schemaVersion} · Stored locally`}
        >
          <StatusDot />
        </SettingRow>
      </SettingsSection>
    </Page>
  );
}
