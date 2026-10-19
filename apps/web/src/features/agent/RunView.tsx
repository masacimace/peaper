import type { AgentQuestion, AgentRun, FileChange, ToolPermission } from '@peaper/shared';
import { diffLines } from 'diff';
import { Check, FileDiff, LoaderCircle, ShieldCheck, Square, Terminal, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '../../components/ui/Button';
import { cn } from '../../components/ui/cn';
import { Field, Input } from '../../components/ui/Field';
import { ErrorNotice, errorStyles } from '../../components/ui/Notice';
import { api } from '../../lib/api';
import { AssistantMessage } from './AssistantMessage';
import { activityOutput, activityStatus } from './tool-output';
import { KnowledgeView } from '../knowledge/KnowledgeView';
import { MemorySuggestion } from '../memory/MemorySuggestion';
import { SkillActivity } from '../skills/SkillActivity';
import { isSkillActivity } from '../skills/skill-activity';
import { MemoryTaskLens } from '../memory/MemoryTaskLens';

const outputStyles =
  'max-h-70 overflow-auto p-2 font-mono text-caption leading-[1.6] whitespace-pre-wrap wrap-anywhere';
const activityColors: Record<string, string> = {
  running: 'bg-warning',
  waiting: 'bg-warning',
  completed: 'bg-success',
  failed: 'bg-danger',
  cancelled: 'bg-subtle',
};

function RunDetails({
  icon,
  title,
  status,
  children,
}: {
  icon: ReactNode;
  title: string;
  status: string;
  children: ReactNode;
}) {
  return (
    <details className="my-2 overflow-hidden rounded-sm border border-border">
      <summary className="flex cursor-pointer items-center gap-2 bg-surface-inset p-2 text-caption">
        {icon}
        <span className="min-w-0 flex-1 wrap-anywhere">{title}</span>
        <small className="text-micro text-subtle">{status}</small>
      </summary>
      {children}
    </details>
  );
}

export function ChangeView({ change }: { change: FileChange }) {
  const parts = useMemo(
    () => diffLines(change.before ?? '', change.after, { timeout: 100, maxEditLength: 5000 }),
    [change.before, change.after],
  );
  return (
    <RunDetails
      icon={<FileDiff size={13} />}
      title={change.path}
      status={change.before === null ? 'new file' : 'diff'}
    >
      {parts ? (
        <pre
          className="max-h-85 overflow-auto bg-editor font-mono text-caption leading-[1.6] text-muted"
          aria-label={`Diff for ${change.path}`}
        >
          {parts.map((part, index) => (
            <span
              key={index}
              className={cn(
                'block min-w-fit px-2',
                part.added && 'bg-success/9 text-success',
                part.removed && 'bg-danger/9 text-danger',
              )}
            >
              {part.value
                .split('\n')
                .map((line, i, lines) =>
                  i === lines.length - 1 && !line
                    ? ''
                    : `${part.added ? '+' : part.removed ? '-' : ' '}${line}\n`,
                )
                .join('')}
            </span>
          ))}
        </pre>
      ) : (
        <div className="p-2">
          <strong>Before</strong>
          <pre className={outputStyles}>{change.before ?? '(new file)'}</pre>
          <strong>After</strong>
          <pre className={outputStyles}>{change.after}</pre>
        </div>
      )}
    </RunDetails>
  );
}
function PermissionView({ permission, runId }: { permission: ToolPermission; runId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function decide(allow: boolean) {
    setBusy(true);
    setError('');
    try {
      await api.decidePermission(runId, permission.id, allow);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not submit decision.');
    } finally {
      setBusy(false);
    }
  }
  if (permission.status !== 'pending') return null;
  return (
    <div
      className="my-3 rounded-md border border-warning bg-surface-overlay p-3"
      role="group"
      aria-label="Permission request"
    >
      <strong className="flex items-center gap-2 text-label text-strong">
        <ShieldCheck size={14} /> Approval required
      </strong>
      <p className="my-2 leading-[1.6]">{permission.description}</p>
      {permission.command && (
        <>
          <pre className={cn(outputStyles, 'rounded-sm bg-surface-inset')}>
            {permission.command}
          </pre>
          <p className="my-2 text-caption leading-[1.6] text-muted">
            Runs in the workspace with your account permissions. No OS sandbox. The command may
            change files or access the network.
          </p>
        </>
      )}
      {permission.change && <ChangeView change={permission.change} />}
      <div className="mt-3 flex flex-wrap items-center gap-2 [&>button]:text-caption">
        <Button variant="primary" disabled={busy} onClick={() => void decide(true)}>
          <Check size={12} />
          Allow once
        </Button>
        <Button disabled={busy} onClick={() => void decide(false)}>
          <X size={12} />
          Deny
        </Button>
      </div>
      {error && <ErrorNotice role="alert">{error}</ErrorNotice>}
    </div>
  );
}
function QuestionView({ question, runId }: { question: AgentQuestion; runId: string }) {
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(text: string) {
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.answerQuestion(runId, question.id, text.trim());
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not submit answer.');
    } finally {
      setBusy(false);
    }
  }
  if (question.status !== 'pending')
    return (
      <p className="my-3 text-caption leading-[1.7] text-muted">
        {question.question}
        {question.answer ? ` — ${question.answer}` : ' — Cancelled'}
      </p>
    );
  return (
    <form
      className="my-3 rounded-md border border-warning bg-surface-overlay p-3"
      aria-label="Agent question"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(answer);
      }}
    >
      <strong className="flex items-center gap-2 text-label text-strong">
        {question.question}
      </strong>
      <div className="my-3 flex flex-wrap gap-2">
        {question.options.map((option) => (
          <Button
            type="button"

            disabled={busy}
            key={option}
            onClick={() => void submit(option)}
          >
            {option}
          </Button>
        ))}
      </div>
      <Field className="text-caption">
        Your answer
        <Input
          className="mb-2 h-auto p-2"
          value={answer}
          maxLength={2000}
          onChange={(event) => setAnswer(event.target.value)}
          disabled={busy}
        />
      </Field>
      <Button variant="primary" type="submit" disabled={busy || !answer.trim()}>
        Send answer
      </Button>
      {error && <ErrorNotice role="alert">{error}</ErrorNotice>}
    </form>
  );
}
export function RunView({ run, onResume }: { run: AgentRun; onResume?: () => Promise<void> }) {
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [resuming, setResuming] = useState(false);
  const running = ['running', 'waiting'].includes(run.status);
  return (
    <article
      className="border-b border-border py-4 text-label wrap-anywhere"
      aria-label={`Task: ${run.prompt.slice(0, 80)}`}
    >
      <div className="rounded-md bg-surface-raised p-3">
        <span className="text-caption text-subtle">You</span>
        <p className="mt-1 leading-[1.65] whitespace-pre-wrap">{run.prompt}</p>
      </div>
      <div className="mt-4 mb-2 flex flex-wrap items-center gap-2">
        <span className="flex min-w-0 items-center gap-1 font-[550] text-strong">
          {running && (
            <LoaderCircle size={12} className="shrink-0 animate-spin motion-reduce:animate-none" />
          )}
          <span className="min-w-0 wrap-anywhere">{run.knowledge.persona?.name || 'Peaper'}</span>
        </span>
        <small className="text-muted">{run.status}</small>
        {run.mode === 'plan' && (
          <small className="rounded-xs border border-border px-1 text-micro text-accent">
            Plan
          </small>
        )}
        {run.inheritedFrom && <small className="text-micro text-subtle">Inherited</small>}
        {run.resumeOf && <small className="text-micro text-subtle">Resumed</small>}
        {running && (
          <Button
            variant="text"
            className="ml-auto text-caption"
            disabled={cancelling}
            onClick={() => {
              setCancelling(true);
              void api
                .cancelRun(run.id)
                .catch((error: Error) => setError(error.message))
                .finally(() => setCancelling(false));
            }}
          >
            <Square size={11} />
            {cancelling ? 'Stopping…' : 'Cancel task'}
          </Button>
        )}
      </div>
      {run.text && <AssistantMessage text={run.text} />}
      <SkillActivity run={run} />
      <div className="my-3">
        {run.activities
          .filter((activity) => !isSkillActivity(activity))
          .map((activity) => (
            <RunDetails
              key={activity.id}
              title={activity.name.replaceAll('_', ' ')}
              status={activityStatus(activity)}
              icon={
                activity.name === 'run_command' ? (
                  <Terminal size={12} />
                ) : (
                  <span
                    className={cn(
                      'size-1.25 shrink-0 rounded-full',
                      activityColors[activity.status] || 'bg-warning',
                    )}
                  />
                )
              }
            >
              <pre className={cn(outputStyles, 'border-b border-border text-muted')}>
                {JSON.stringify(activity.input, null, 2)}
              </pre>
              {activity.output && (
                <pre className={outputStyles} aria-label={`${activity.name} output`}>
                  {activityOutput(activity)}
                </pre>
              )}
            </RunDetails>
          ))}
      </div>
      {run.permissions.map((permission) => (
        <PermissionView key={permission.id} permission={permission} runId={run.id} />
      ))}
      {run.questions.map((question) => (
        <QuestionView key={question.id} question={question} runId={run.id} />
      ))}
      {run.changes.length > 0 && (
        <div className="mt-3">
          <span className="mt-0.5 mb-3.5 flex items-center gap-1.75 text-mini font-medium tracking-[1px] text-subtle">
            APPLIED CHANGES
          </span>
          {run.changes.map((change) => (
            <ChangeView key={change.id} change={change} />
          ))}
        </div>
      )}
      {run.error && (
        <p
          className={
            run.status === 'cancelled' || run.status === 'interrupted'
              ? 'my-3 text-caption leading-[1.7] text-muted'
              : errorStyles
          }
          role="status"
        >
          {run.error}
        </p>
      )}
      {error && <ErrorNotice role="alert">{error}</ErrorNotice>}
      {onResume && (
        <Button
          className="mt-2"
          disabled={resuming}
          onClick={() => {
            setResuming(true);
            void onResume()
              .catch((e: Error) => setError(e.message))
              .finally(() => setResuming(false));
          }}
        >
          {resuming ? 'Resuming…' : 'Resume task'}
        </Button>
      )}
      {run.instructions.length > 0 && (
        <details className="mt-3 text-micro text-subtle">
          <summary>Instructions used · {run.instructions.length} sources</summary>
          {run.instructions.map((source) => (
            <div key={`${source.path}:${source.digest}`} className="mt-2">
              <span className="wrap-anywhere">
                {source.scope} · {source.path}
              </span>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap">
                {source.content}
              </pre>
            </div>
          ))}
        </details>
      )}
      {run.usage && (
        <div className="mt-3 text-micro text-subtle">
          {run.usage.inputTokens !== undefined
            ? `${run.usage.inputTokens} input tokens`
            : 'Input usage unavailable'}{' '}
          ·{' '}
          {run.usage.outputTokens !== undefined
            ? `${run.usage.outputTokens} output tokens`
            : 'Output usage unavailable'}
        </div>
      )}
      <MemoryTaskLens run={run} />
      <KnowledgeView snapshot={run.knowledge} showSkills={false} showMemory={false} />
      {run.memorySuggestions.map((suggestion) => (
        <MemorySuggestion key={suggestion.id} suggestion={suggestion} />
      ))}
    </article>
  );
}
