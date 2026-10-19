import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Settings2, Star } from 'lucide-react';
import {
  availableEfforts,
  effortLabel,
  validEffort,
  type ModelSelection,
  type ModelState,
  type ReasoningEffort,
} from '@peaper/shared';
import { StatusDot } from '../../components/ui/Status';

export function ModelPicker({
  state,
  selection,
  onSelect,
  onManage,
  workspaceId,
}: {
  state: ModelState;
  selection: ModelSelection | null;
  onSelect: (selection: ModelSelection) => Promise<void>;
  onManage: () => void;
  workspaceId: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem(`peaper:recent-models:${workspaceId}`) || '[]',
      );
      return Array.isArray(value)
        ? value.filter((id): id is string => typeof id === 'string').slice(0, 8)
        : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const selected = menu.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
      (
        selected ?? menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')
      )?.focus();
    });
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  const model = state.models.find((item) => item.id === selection?.modelId);
  const connection = state.connections.find((item) => item.id === model?.connectionId);
  const choices = state.models
    .filter(
      (item) =>
        item.available &&
        state.connections.some(
          (connection) => connection.id === item.connectionId && connection.enabled,
        ) &&
        (item.showInChat || item.id === selection?.modelId) &&
        item.toolCalling !== false,
    )
    .sort(
      (a, b) =>
        Number(b.favorite) - Number(a.favorite) ||
        (recent.includes(a.id) ? recent.indexOf(a.id) : 100) -
          (recent.includes(b.id) ? recent.indexOf(b.id) : 100) ||
        a.name.localeCompare(b.name),
    );
  async function choose(value: ModelSelection) {
    setBusy(true);
    setError('');
    try {
      await onSelect(value);
      setOpen(false);
      trigger.current?.focus();
      const next = [value.modelId, ...recent.filter((id) => id !== value.modelId)].slice(0, 8);
      setRecent(next);
      try {
        localStorage.setItem(`peaper:recent-models:${workspaceId}`, JSON.stringify(next));
      } catch {
        /* Optional preference. */
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not select model.');
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      ref={root}
      className="relative ml-auto flex min-w-0 flex-1 items-center justify-end gap-1 @max-[300px]/composer:order-first @max-[300px]/composer:basis-full"
    >
      <button
        ref={trigger}
        className="inline-flex h-7 max-w-56 min-w-0 items-center gap-1.5 rounded-sm px-1.5 text-caption text-muted hover:bg-surface-hover hover:text-foreground"
        aria-label="Select model"
        title={
          model
            ? `${model.name} · ${connection?.name ?? 'Unavailable connection'}`
            : 'Choose a model'
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={busy}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <StatusDot warning={!model?.verifiedAt || !connection?.enabled} />
        <span className="min-w-0 truncate">{model?.name || 'Choose model'}</span>
        <ChevronDown size={12} />
      </button>
      {model &&
        connection?.enabled &&
        model.reasoning &&
        model.reasoning.efforts.length > 0 &&
        selection && (
          <>
            <span aria-hidden="true" className="mx-0.5 h-3 w-px shrink-0 bg-border-strong" />
            <div className="relative h-7 w-19 shrink-0">
              <select
                aria-label="Reasoning effort"
                title="Reasoning effort · applies to the next task"
                className="h-full w-full cursor-pointer appearance-none rounded-sm border-0 bg-transparent py-0 pr-5 pl-1.5 text-caption text-muted hover:bg-surface-hover hover:text-foreground"
                disabled={busy}
                value={validEffort(model, selection.effort)}
                onChange={(event) =>
                  void choose({ modelId: model.id, effort: event.target.value as ReasoningEffort })
                }
              >
                {availableEfforts(model).map((effort) => (
                  <option key={effort} value={effort}>
                    {effortLabel(effort)}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={12}
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-muted"
              />
            </div>
          </>
        )}
      {open && (
        <div
          ref={menu}
          role="dialog"
          aria-label="Choose model"
          className="absolute right-0 bottom-9 z-(--layer-menu) w-70 max-w-[calc(100vw-80px)] overflow-hidden rounded-md border border-border-strong bg-surface-overlay shadow-menu"
          onKeyDown={(event) => {
            const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
            if (!keys.includes(event.key)) return;
            event.preventDefault();
            const buttons = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
            );
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? buttons.length - 1
                  : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
                    buttons.length;
            buttons[next]?.focus();
          }}
        >
          <div className="max-h-70 overflow-y-auto p-1">
            {choices.map((item) => (
              <button
                key={item.id}
                disabled={busy}
                aria-pressed={selection?.modelId === item.id}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left hover:bg-surface-hover"
                onClick={() => void choose({ modelId: item.id, effort: item.options.effort })}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-caption text-foreground">
                    {item.favorite && <Star size={10} className="fill-accent text-accent" />}
                    <span className="truncate">{item.name}</span>
                  </span>
                  <small className="mt-0.5 block text-micro text-subtle">
                    {
                      state.connections.find((connection) => connection.id === item.connectionId)
                        ?.name
                    }{' '}
                    · {item.verifiedAt ? 'Tested' : 'Not tested'}
                  </small>
                </span>
                {selection?.modelId === item.id && <Check size={13} className="text-accent" />}
              </button>
            ))}
            {!choices.length && (
              <p className="px-3 py-5 text-caption text-muted">
                Add models to chat from the Model Catalog.
              </p>
            )}
          </div>
          {error && (
            <p role="alert" className="px-3 py-2 text-caption text-danger">
              {error}
            </p>
          )}
          <button
            onClick={() => {
              setOpen(false);
              onManage();
            }}
            className="flex w-full items-center gap-2 border-t border-border-subtle px-3 py-2.5 text-caption text-muted hover:bg-surface-hover"
          >
            <Settings2 size={13} />
            Manage models
          </button>
        </div>
      )}
      {error && !open && (
        <span role="alert" className="sr-only">
          {error}
        </span>
      )}
    </div>
  );
}
