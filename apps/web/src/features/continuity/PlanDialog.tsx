import { useState } from 'react';
import type { ContinuityState, ModelSelection } from '@peaper/shared';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/ui/Button';
import { ErrorNotice } from '../../components/ui/Notice';
import { api } from '../../lib/api';

export function PlanDialog({
  id,
  plan,
  selection,
  running,
  onClose,
  onRefresh,
  onImplemented,
}: {
  id: string;
  plan: NonNullable<ContinuityState['plan']>;
  selection: ModelSelection | null;
  running: boolean;
  onClose: () => void;
  onRefresh: () => Promise<unknown>;
  onImplemented: () => void;
}) {
  const [text, setText] = useState(plan.text),
    [busy, setBusy] = useState(''),
    [error, setError] = useState('');
  const dirty = text !== plan.text;
  async function save() {
    setBusy('save');
    setError('');
    try {
      await api.savePlan(id, text, plan.revision);
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save plan.');
    } finally {
      setBusy('');
    }
  }
  async function implement() {
    setBusy('implement');
    setError('');
    try {
      await api.implementPlan(id, plan.revision, selection);
      onImplemented();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start implementation.');
    } finally {
      setBusy('');
    }
  }
  return (
    <Dialog title="Review plan" onClose={onClose} className="w-180 max-w-[calc(100vw-24px)]">
      <p className="mb-3 text-caption leading-relaxed text-muted">
        Review or revise the approach before starting Build mode. File changes and commands will
        still need individual approval.
      </p>
      <textarea
        aria-label="Implementation plan"
        className="h-[min(50dvh,420px)] w-full resize-y rounded-sm border border-border bg-surface-inset p-3 font-mono text-label leading-relaxed outline-none"
        maxLength={12000}
        value={text}
        disabled={Boolean(busy) || Boolean(plan.implementedBy)}
        onChange={(e) => setText(e.target.value)}
      />
      {error && <ErrorNotice className="my-3">{error}</ErrorNotice>}
      {plan.implementedBy ? (
        <p className="mt-3 text-caption text-success">
          Implementation has started. Follow its progress in the conversation.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button
            disabled={!dirty || !text.trim() || running || Boolean(busy)}
            onClick={() => void save()}
          >
            {busy === 'save' ? 'Saving…' : 'Save revision'}
          </Button>
          <Button
            variant="primary"
            disabled={dirty || running || Boolean(busy) || !selection}
            onClick={() => void implement()}
          >
            {busy === 'implement' ? 'Starting…' : 'Implement reviewed plan'}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
