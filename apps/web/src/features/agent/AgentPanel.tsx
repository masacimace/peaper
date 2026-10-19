import type { Session, Workspace, MemoryInput, MemorySelection } from '@peaper/shared';
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
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, IconButton } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorNotice } from '../../components/ui/Notice';
import { StatusDot } from '../../components/ui/Status';
import { cn } from '../../components/ui/cn';
import { Panel } from '../../layout/Panel';
import { api } from '../../lib/api';
import { useScrollActivity } from '../../lib/useScrollActivity';
import { RunView } from './RunView';
import { useAgent } from './useAgent';
import type { useModels } from '../models/useModels';
import { ModelPicker } from '../models/ModelPicker';
import { useContinuity } from '../continuity/useContinuity';
import { useSessionDraft } from '../continuity/useSessionDraft';
import { ContinuityBar } from '../continuity/ContinuityBar';
import type { useKnowledge } from '../knowledge/useKnowledge';
import { ContextPicker } from '../knowledge/ContextPicker';
import { MemoryDialog } from '../memory/MemoryDialog';
import { MemoryLensControl } from '../memory/MemoryLens';

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
  models,
  onModels,
  onSessionCreated,
  knowledge,
  onSkills,
  ...panel
}: {
  workspace: Workspace;
  session?: Session;
  selectedFile: string | null;
  onNewSession: () => void;
  onSettings: () => void;
  models: ReturnType<typeof useModels>;
  onModels: () => void;
  onSessionCreated: (session: Session) => void;
  knowledge: ReturnType<typeof useKnowledge>;
  onSkills: () => void;
  hidden: boolean;
  width: number;
  maximized: boolean;
  onMaximize: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState('Agent');
  const sessionDraft = useSessionDraft(workspace.id, session?.id);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [remember, setRemember] = useState<Partial<MemoryInput> | null>(null);
  const [memoryNotice, setMemoryNotice] = useState('');
  const memoryKey = session?.id ?? 'workspace';
  const [memoryChoices, setMemoryChoices] = useState<Record<string, MemorySelection>>({});
  const memorySelection = memoryChoices[memoryKey] ?? { includeIds: [], excludeIds: [] };
  const agent = useAgent(session?.id);
  const scroll = useRef<HTMLDivElement>(null);
  const { scrolling, onScrollActivity } = useScrollActivity();
  const followOutput = useRef(true);
  useLayoutEffect(() => {
    if (followOutput.current && scroll.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [agent.runs]);
  const changes = useRef(new Set<string>());
  useEffect(() => {
    let changed = false;
    for (const run of agent.runs)
      for (const change of run.changes) {
        if (!changes.current.has(change.id)) {
          changes.current.add(change.id);
          changed = true;
        }
      }
    if (changed) window.dispatchEvent(new Event('peaper:workspace-changed'));
  }, [agent.runs]);
  const running = agent.runs.some((run) => ['running', 'waiting'].includes(run.status));
  const { model, connection, selection, selectionLoading, selectionError } = models;
  const continuity = useContinuity(session?.id, selection, selectedFile);
  const ready = Boolean(
    model?.verifiedAt &&
    model.available &&
    connection?.enabled &&
    selection &&
    !selectionLoading &&
    !selectionError &&
    sessionDraft.loaded &&
    knowledge.loaded,
  );
  const draft = sessionDraft.draft;
  const remembering = /^\/remember\s/i.test(draft.trim());
  function setDraft(value: string) {
    sessionDraft.setDraft(value);
  }
  async function send() {
    const command = /^\/remember(?:\s+(global|project|recap))?\s+([\s\S]+)$/i.exec(draft.trim());
    if (command) {
      setRemember({
        title: command[2]!.trim().slice(0, 80),
        body: command[2]!.trim(),
        scope: (command[1]?.toLowerCase() as MemoryInput['scope']) ?? 'project',
        sessionId: session?.id ?? null,
      });
      return;
    }
    if (!draft.trim() || sending || running || !ready || !selection) return;
    const text = draft;
    setSending(true);
    setSendError('');
    try {
      let target = session;
      if (!target) {
        target = await api.createSession(text.trim().slice(0, 80));
        onSessionCreated(target);
      }
      await api.sendMessage(
        target.id,
        text,
        selectedFile,
        selection,
        sessionDraft.mode,
        knowledge.selection,
        memorySelection,
      );
      setMemoryChoices((old) =>
        old[memoryKey] === memorySelection
          ? { ...old, [memoryKey]: { includeIds: [], excludeIds: [] } }
          : old,
      );
      sessionDraft.clearIfUnchanged(text);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Could not send message.');
    } finally {
      setSending(false);
    }
  }
  return (
    <Panel
      title="Agent"
      className={cn('scroll-surface shrink-0 bg-surface-panel', scrolling && 'is-scrolling')}
      headerClassName="pl-1"
      hidden={panel.hidden}
      style={{ width: panel.maximized ? '100%' : panel.width }}
      onMaximize={panel.onMaximize}
      maximized={panel.maximized}
      onClose={panel.onClose}
      header={
        <div className="flex h-full gap-0.75" role="tablist" aria-label="Agent views">
          {['Agent', 'Tasks', 'Context'].map((name) => (
            <button
              key={name}
              role="tab"
              aria-selected={name === tab}
              className="relative px-2.5 text-caption text-muted hover:text-foreground aria-selected:text-strong aria-selected:after:absolute aria-selected:after:inset-x-2.5 aria-selected:after:bottom-0 aria-selected:after:h-px aria-selected:after:bg-accent"
              onClick={() => setTab(name)}
            >
              {name}
            </button>
          ))}
        </div>
      }
    >
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden px-3 pt-3.75 pb-1.75 short:pt-2.5"
        hidden={tab !== 'Agent'}
        onScrollCapture={onScrollActivity}
      >
        <div
          className="-mr-2 mb-2 min-h-0 flex-1 [scrollbar-gutter:stable] overflow-y-auto pr-2"
          ref={scroll}
          onScroll={() => {
            const element = scroll.current;
            if (element)
              followOutput.current =
                element.scrollHeight - element.scrollTop - element.clientHeight < 80;
          }}
        >
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center text-strong">
              <Bot size={24} strokeWidth={1.4} />
            </span>
            <div className="min-w-0">
              <h2 className="text-small font-[550] text-strong">Coding agent</h2>
              <span className="mt-1 flex items-center gap-1.25 text-micro wrap-anywhere text-muted">
                <StatusDot warning={!ready} />
                {connection?.name || 'No model selected'}
              </span>
            </div>
            <IconButton
              className="ml-auto"
              title="New session"
              aria-label="New agent session"
              onClick={onNewSession}
            >
              <Plus size={16} />
            </IconButton>
          </div>
          {agent.runs.length === 0 && (
            <>
              <p className="mt-3.75 mb-4 text-caption leading-[1.75] text-muted short:my-2.5">
                {ready
                  ? 'Describe a task to start. Peaper can inspect, edit, and test your code with your approval.'
                  : 'A place to build, debug, and work through your code. Choose a tested model to start a conversation.'}
              </p>
              {session && (
                <div className="-mt-0.25 mb-2.75 flex items-center gap-1.75 rounded-sm border border-success bg-success-soft px-1.75 py-1.5 text-micro">
                  <StatusDot />
                  <span className="min-w-0 flex-1 truncate" title={session.title}>
                    {session.title}
                  </span>
                  <small className="text-mini text-subtle">{session.status}</small>
                </div>
              )}
              <div className="flex flex-col gap-1.25">
                {starters.map(({ title, description, icon: Icon, draft }) => (
                  <button
                    className="flex min-h-13.25 w-full items-center gap-2.25 rounded-[5px] border border-border-subtle bg-surface p-2 text-left hover:border-border-strong hover:bg-surface-hover max-workspace:min-h-12.25"
                    key={title}
                    onClick={() => setDraft(draft)}
                  >
                    <span className="grid size-7.5 shrink-0 place-items-center rounded-sm bg-surface-raised text-muted">
                      <Icon size={18} strokeWidth={1.4} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block text-caption font-medium text-strong">
                        {title}
                      </strong>
                      <small className="mt-0.75 block text-mini leading-[1.6] text-muted">
                        {description}
                      </small>
                    </span>
                    <ChevronRight size={13} className="text-subtle" />
                  </button>
                ))}
              </div>
              <div className="mx-0.25 my-3.75 flex justify-between gap-1.75 text-mini text-subtle short:my-2.5">
                <span>Workspace context</span>
                <span className="truncate text-muted">
                  {selectedFile ? '1 file open' : workspace.name}
                </span>
              </div>
            </>
          )}
          {continuity.info?.state.parent && (
            <p className="my-2 text-caption text-subtle">Forked conversation · shared workspace</p>
          )}
          {agent.runs.map((run, index) => (
            <RunView
              key={run.id}
              run={run}
              onResume={
                index === agent.runs.length - 1 &&
                !running &&
                ready &&
                !run.inheritedFrom &&
                ['failed', 'cancelled', 'interrupted'].includes(run.status)
                  ? async () => {
                      await api.resumeRun(run.id, selection);
                    }
                  : undefined
              }
            />
          ))}
          {(sendError || agent.error || selectionError) && (
            <ErrorNotice role="alert">{sendError || agent.error || selectionError}</ErrorNotice>
          )}
        </div>
        <ContinuityBar
          session={session}
          runs={agent.runs}
          controller={continuity}
          selection={selection}
          mode={sessionDraft.mode}
          onMode={sessionDraft.setMode}
          running={running}
          onSelect={onSessionCreated}
          onRewound={(mode) => {
            sessionDraft.setMode(mode);
            void continuity.refresh();
          }}
        >
          <ContextPicker
            controller={knowledge}
            onManage={onSkills}
            onRemember={() => setRemember({ sessionId: session?.id ?? null })}
          />
          <MemoryLensControl
            query={draft}
            sessionId={session?.id}
            value={memorySelection}
            onChange={(value) => setMemoryChoices((old) => ({ ...old, [memoryKey]: value }))}
          />
        </ContinuityBar>
        {memoryNotice && (
          <p role="status" className="mb-2 text-caption text-success">
            {memoryNotice}
          </p>
        )}
        {(sessionDraft.error || continuity.error || knowledge.error) && (
          <p role="status" className="mb-2 text-caption text-warning">
            {sessionDraft.error || continuity.error || knowledge.error}
          </p>
        )}
        <div className="@container/composer mt-auto shrink-0 rounded-md border border-border-strong bg-surface-raised px-2 pt-2.25 pb-2 shadow-composer">
          <textarea
            className="h-10 max-h-35 min-h-10 w-full resize-y border-0 bg-transparent px-0.5 text-caption text-strong outline-none"
            aria-label="Draft an agent message"
            placeholder="Message the agent…"
            value={draft}
            disabled={!sessionDraft.loaded}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={16000}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <div className="flex min-w-0 items-center gap-1.5 @max-[300px]/composer:flex-wrap">
            <span className="flex shrink-0 items-center [&>button]:size-7">
              <IconButton
                title="File context is available in the Context tab"
                aria-label="View file context"
                onClick={() => setTab('Context')}
              >
                <AtSign size={14} />
              </IconButton>
              <IconButton
                title="View workspace context"
                aria-label="View workspace context"
                onClick={() => setTab('Context')}
              >
                <Paperclip size={14} />
              </IconButton>
            </span>
            <ModelPicker
              state={models.state}
              selection={selection}
              onSelect={models.select}
              onManage={onModels}
              workspaceId={workspace.id}
            />
            <button
              className="ml-auto inline-grid size-7 shrink-0 place-items-center rounded-sm border border-accent bg-accent text-accent-foreground"
              aria-label="Send agent message"
              disabled={
                (!ready && !remembering) || !draft.trim() || (running && !remembering) || sending
              }
              title={ready ? 'Send message (Enter)' : 'Choose and test a model on the Models page'}
              onClick={() => void send()}
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
        <span className="mt-1.5 shrink-0 text-center text-tiny text-subtle">
          {ready ? (
            'Enter to send · Shift+Enter for a new line'
          ) : selectionLoading ? (
            'Loading session model…'
          ) : (
            <button onClick={onModels}>
              {model
                ? 'Test or manage this model in Models'
                : 'Connect a provider in Models to start'}
            </button>
          )}
        </span>
      </div>
      {remember && (
        <MemoryDialog
          initial={remember}
          sessions={session ? [session] : []}
          onClose={() => setRemember(null)}
          onSaved={() => {
            setMemoryNotice(
              'Memory saved. It will be considered by future tasks within its scope.',
            );
            if (draft.trim().startsWith('/remember')) sessionDraft.clearIfUnchanged(draft);
            void continuity.refresh().catch(() => {});
          }}
        />
      )}
      <div
        className="h-full overflow-auto p-3.5"
        hidden={tab !== 'Tasks'}
        onScrollCapture={onScrollActivity}
      >
        <div className="mt-0.5 mb-3.5 flex items-center gap-1.75 text-mini font-medium tracking-[1px] text-subtle">
          <ListTodo size={14} />
          TASKS
        </div>
        {agent.runs.length === 0 ? (
          <EmptyState
            className="mt-9.5"
            icon={CheckCheck}
            title="No tasks running"
            description="Agent work and background commands will appear here as they become available."
          />
        ) : (
          <div className="py-3">
            {[...agent.runs].reverse().map((run) => (
              <section className="border-b border-border py-3 text-label" key={run.id}>
                <strong className="block font-medium wrap-anywhere">{run.prompt}</strong>
                <small className="my-2 text-caption text-muted">{run.status}</small>
                {run.todos.map((todo, index) => (
                  <div
                    className={cn(
                      'my-2 flex gap-2 leading-[1.6]',
                      todo.status === 'completed' && 'text-subtle',
                    )}
                    key={index}
                  >
                    <span
                      className={cn(
                        todo.status === 'completed' && 'text-success',
                        todo.status === 'in_progress' && 'text-accent',
                      )}
                    >
                      {todo.status === 'completed'
                        ? '✓'
                        : todo.status === 'in_progress'
                          ? '◉'
                          : '○'}
                    </span>
                    {todo.text}
                  </div>
                ))}
                <p className="my-2 text-caption text-muted">
                  {run.activities.length} tool calls · {run.changes.length} file changes
                </p>
              </section>
            ))}
          </div>
        )}
      </div>
      <div
        className="h-full overflow-auto p-3.5"
        hidden={tab !== 'Context'}
        onScrollCapture={onScrollActivity}
      >
        <div className="mt-0.5 mb-3.5 flex items-center gap-1.75 text-mini font-medium tracking-[1px] text-subtle">
          <Braces size={14} />
          WORKSPACE CONTEXT
        </div>
        <dl className="mb-7">
          <ContextItem title="Project" value={workspace.name} />
          <ContextItem title="Workspace" value={workspace.path} mono />
          <ContextItem title="Session" value={session?.title || 'No session selected'} />
          <ContextItem title="Open file" value={selectedFile || 'No file selected'} mono />
        </dl>
        <div className="mt-0.5 mb-3.5 flex items-center gap-1.75 text-mini font-medium tracking-[1px] text-subtle">
          PERSONALIZATION
        </div>
        {[
          [
            'Instructions',
            continuity.info?.instructions.length
              ? `${continuity.info.instructions.length} active`
              : 'No PEAPER.md found',
          ],
          ['Skills', 'Not configured'],
          ['Memory', 'Not configured'],
        ].map(([label, status]) => (
          <div
            key={label}
            className="flex justify-between border-b border-border-subtle py-2.25 text-caption"
          >
            <span>{label}</span>
            <small className="text-mini text-subtle">{status}</small>
          </div>
        ))}
        <Button variant="text" className="mt-4.75 text-caption" onClick={onSettings}>
          <Settings2 size={14} />
          Workspace settings
          <ArrowUpRight size={13} />
        </Button>
      </div>
    </Panel>
  );
}
function ContextItem({ title, value, mono }: { title: string; value: string; mono?: boolean }) {
  return (
    <div className="mb-4">
      <dt className="mb-1 text-micro text-muted">{title}</dt>
      <dd className={cn('text-caption leading-[1.7] wrap-anywhere', mono && 'font-mono')}>
        {value}
      </dd>
    </div>
  );
}
