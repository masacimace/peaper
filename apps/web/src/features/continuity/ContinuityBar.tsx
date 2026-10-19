import { useState } from 'react';
import { FileText, Gauge } from 'lucide-react';
import type { AgentMode, AgentRun, ModelSelection, Session } from '@peaper/shared';
import { Button } from '../../components/ui/Button';
import { cn } from '../../components/ui/cn';
import type { useContinuity } from './useContinuity';
import { ContextDialog } from './ContextDialog';
import { PlanDialog } from './PlanDialog';
import { SessionActions } from './SessionActions';

export function ContinuityBar({
  session,
  runs,
  controller,
  selection,
  mode,
  onMode,
  running,
  onSelect,
  onRewound,
}: {
  session?: Session;
  runs: AgentRun[];
  controller: ReturnType<typeof useContinuity>;
  selection: ModelSelection | null;
  mode: AgentMode;
  onMode: (mode: AgentMode) => void;
  running: boolean;
  onSelect: (session: Session) => void;
  onRewound: (mode: AgentMode) => void;
}) {
  const [dialog, setDialog] = useState<'context' | 'plan' | null>(null),
    info = controller.info;
  const ratio =
    info && info.budget ? Math.min(100, Math.round((info.estimatedTokens / info.budget) * 100)) : 0;
  return (
    <div className="flex min-h-8 shrink-0 flex-wrap items-center gap-1 py-1">
      <select
        aria-label="Agent mode"
        title="Plan explores without file writes or commands"
        className="h-7 rounded-sm border-0 bg-transparent px-1 text-caption text-muted"
        value={mode}
        disabled={running}
        onChange={(e) => onMode(e.target.value as AgentMode)}
      >
        <option value="build">Build</option>
        <option value="plan">Plan</option>
      </select>
      {info?.state.plan && !info.state.plan.implementedBy && (
        <Button
          variant="text"
          className="min-h-7 px-1 text-caption text-accent"
          onClick={() => setDialog('plan')}
        >
          <FileText size={11} />
          Review plan
        </Button>
      )}
      <button
        aria-label="Context usage and instructions"
        title={
          info
            ? `Estimated ${info.estimatedTokens.toLocaleString()} tokens of ${info.budget.toLocaleString()} input budget`
            : 'Select a session to inspect context'
        }
        className={cn(
          'ml-auto inline-flex h-7 items-center gap-1 rounded-sm px-1 text-micro text-subtle hover:bg-surface-hover',
          ratio >= 80 && 'text-warning',
        )}
        disabled={!info}
        onClick={() => setDialog('context')}
      >
        <Gauge size={12} />
        {info ? `~${ratio}% context` : 'Context'}
      </button>
      {session && (
        <SessionActions
          session={session}
          runs={runs}
          running={running}
          up
          onSelect={onSelect}
          onRewound={onRewound}
        />
      )}
      {dialog === 'context' && session && info && (
        <ContextDialog
          id={session.id}
          info={info}
          selection={selection}
          running={running}
          onClose={() => setDialog(null)}
          onRefresh={controller.refresh}
        />
      )}
      {dialog === 'plan' && session && info?.state.plan && (
        <PlanDialog
          key={info.state.plan.runId}
          id={session.id}
          plan={info.state.plan}
          selection={selection}
          running={running}
          onClose={() => setDialog(null)}
          onRefresh={controller.refresh}
          onImplemented={() => onMode('build')}
        />
      )}
    </div>
  );
}
