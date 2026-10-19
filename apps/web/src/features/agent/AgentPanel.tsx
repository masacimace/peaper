import { useState } from 'react';
import {
  ArrowUp,
  ArrowUpRight,
  AtSign,
  Bot,
  Braces,
  Bug,
  CheckCheck,
  ChevronRight,
  Code2,
  FileCode2,
  FlaskConical,
  ListTodo,
  Paperclip,
  Plus,
  Settings2,
} from 'lucide-react';
import type { Session, Workspace } from '@peaper/shared';
import { Panel } from '../../layout/Panel';

const starters = [
  {
    title: 'Implement a feature',
    description: 'Describe what you want to build',
    icon: Code2,
    draft: 'Implement a feature: ',
  },
  {
    title: 'Debug an issue',
    description: 'Start with an error or unexpected behavior',
    icon: Bug,
    draft: 'Help me debug: ',
  },
  {
    title: 'Review your code',
    description: 'Take a closer look at a change',
    icon: FileCode2,
    draft: 'Review the code in ',
  },
  {
    title: 'Run tests',
    description: 'Check the behavior of your project',
    icon: FlaskConical,
    draft: 'Run tests for ',
  },
];
export function AgentPanel({
  workspace,
  session,
  selectedFile,
  onNewSession,
  onSettings,
  ...panel
}: {
  workspace: Workspace;
  session?: Session;
  selectedFile: string | null;
  onNewSession: () => void;
  onSettings: () => void;
  hidden: boolean;
  width: number;
  maximized: boolean;
  onMaximize: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState('Agent');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftKey = session?.id || 'workspace';
  const draft = drafts[draftKey] || '';
  function setDraft(value: string) {
    setDrafts((previous) => ({ ...previous, [draftKey]: value }));
  }
  return (
    <Panel
      title="Agent"
      className="agent-panel"
      hidden={panel.hidden}
      style={{ width: panel.maximized ? '100%' : panel.width }}
      onMaximize={panel.onMaximize}
      maximized={panel.maximized}
      onClose={panel.onClose}
      header={
        <div className="panel-tabs" role="tablist" aria-label="Agent views">
          {['Agent', 'Tasks', 'Context'].map((name) => (
            <button
              key={name}
              role="tab"
              aria-selected={name === tab}
              className={name === tab ? 'active' : ''}
              onClick={() => setTab(name)}
            >
              {name}
            </button>
          ))}
        </div>
      }
    >
      <div className="agent-content" hidden={tab !== 'Agent'}>
        <div className="agent-scroll">
          <div className="agent-heading">
            <span className="agent-avatar">
              <Bot size={24} strokeWidth={1.4} />
            </span>
            <div>
              <h2>Coding agent</h2>
              <span className="agent-connection">
                <span className="status-dot warning-dot" />
                No model connected
              </span>
            </div>
            <button
              className="icon-button"
              title="New session"
              aria-label="New agent session"
              onClick={onNewSession}
            >
              <Plus size={16} />
            </button>
          </div>
          <p className="agent-intro">
            A place to build, debug, and work through your code. Connect a model to start a
            conversation.
          </p>
          {session && (
            <div className="active-session">
              <MessageMark />
              <span title={session.title}>{session.title}</span>
              <small>{session.status}</small>
            </div>
          )}
          <div className="agent-starters">
            {starters.map(({ title, description, icon: Icon, draft }) => (
              <button className="agent-starter" key={title} onClick={() => setDraft(draft)}>
                <span className="starter-icon">
                  <Icon size={18} strokeWidth={1.4} />
                </span>
                <span>
                  <strong>{title}</strong>
                  <small>{description}</small>
                </span>
                <ChevronRight size={13} />
              </button>
            ))}
          </div>
          <div className="agent-footnote">
            <span>Workspace context</span>
            <span>{selectedFile ? '1 file open' : workspace.name}</span>
          </div>
        </div>
        <div className="agent-composer">
          <textarea
            aria-label="Draft an agent message"
            placeholder="Message the agent…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="composer-footer">
            <span className="composer-attachments">
              <button
                className="icon-button"
                title="File context is available in the Context tab"
                aria-label="View file context"
                onClick={() => setTab('Context')}
              >
                <AtSign size={14} />
              </button>
              <button
                className="icon-button"
                title="View workspace context"
                aria-label="View workspace context"
                onClick={() => setTab('Context')}
              >
                <Paperclip size={14} />
              </button>
            </span>
            <button className="model-control" onClick={onSettings}>
              <span className="status-dot warning-dot" />
              Connect a model
              <ChevronRight size={12} />
            </button>
            <button
              className="send-button"
              aria-label="Send agent message"
              disabled
              title="Connect a model to send messages"
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
        <span className="composer-caption">Messages stay in draft until a model is connected.</span>
      </div>
      <div className="agent-task-content" hidden={tab !== 'Tasks'}>
        <div className="context-section-title">
          <ListTodo size={14} />
          TASKS
        </div>
        <div className="panel-empty">
          <CheckCheck size={25} strokeWidth={1.2} />
          <h3>No tasks running</h3>
          <p>Agent work and background commands will appear here as they become available.</p>
        </div>
      </div>
      <div className="context-content" hidden={tab !== 'Context'}>
        <div className="context-section-title">
          <Braces size={14} />
          WORKSPACE CONTEXT
        </div>
        <dl className="context-list">
          <div>
            <dt>Project</dt>
            <dd>{workspace.name}</dd>
          </div>
          <div>
            <dt>Workspace</dt>
            <dd className="mono">{workspace.path}</dd>
          </div>
          <div>
            <dt>Session</dt>
            <dd>{session?.title || 'No session selected'}</dd>
          </div>
          <div>
            <dt>Open file</dt>
            <dd className="mono">{selectedFile || 'No file selected'}</dd>
          </div>
        </dl>
        <div className="context-section-title">PERSONALIZATION</div>
        <div className="context-pending">
          <span>Instructions</span>
          <small>Not loaded</small>
        </div>
        <div className="context-pending">
          <span>Skills</span>
          <small>Not configured</small>
        </div>
        <div className="context-pending">
          <span>Memory</span>
          <small>Not configured</small>
        </div>
        <button className="text-button context-settings" onClick={onSettings}>
          <Settings2 size={14} />
          Workspace settings
          <ArrowUpRight size={13} />
        </button>
      </div>
    </Panel>
  );
}
function MessageMark() {
  return <span className="status-dot" />;
}
