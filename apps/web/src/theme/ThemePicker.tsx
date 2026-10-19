import { Check } from 'lucide-react';
import { cn } from '../components/ui/cn';
import { themes } from './themes';
import { setTheme, useTheme } from './useTheme';

export function ThemePicker() {
  const selected = useTheme();
  const active = themes.find((theme) => theme.id === selected)!;
  return (
    <div className="border-b border-border-subtle pt-3 pb-5">
      <div className="mb-3 flex items-center justify-between text-label text-foreground">
        <span>Color scheme</span>
        <span className="text-caption text-muted" role="status">
          {active.name}
        </span>
      </div>
      <fieldset className="grid grid-cols-[repeat(auto-fit,minmax(145px,1fr))] gap-3 border-0 p-0">
        <legend className="sr-only">Color scheme</legend>
        {themes.map((theme) => (
          <label className="group relative cursor-pointer" key={theme.id}>
            <input
              className="peer sr-only"
              type="radio"
              name="color-scheme"
              value={theme.id}
              aria-label={theme.name}
              checked={selected === theme.id}
              onChange={() => setTheme(theme.id)}
            />
            <span className="flex h-full flex-col gap-1.75 rounded-md border border-border-strong bg-surface p-2.25 group-hover:bg-surface-hover peer-checked:border-accent peer-checked:inset-ring-1 peer-checked:inset-ring-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-accent">
              <ThemeSample id={theme.id} />
              <span className="flex items-center justify-between gap-1 text-foreground">
                <strong className="text-label font-medium">{theme.name}</strong>
                {selected === theme.id && (
                  <Check size={13} className="text-accent" aria-hidden="true" />
                )}
              </span>
              <small className="text-caption leading-[1.7] text-muted">
                {theme.mode === 'dark' ? 'Dark' : 'Light'} · {theme.description}
              </small>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="mt-3.25 text-caption leading-[1.7] text-muted">
        Saved in this browser. Applies to Peaper, the editor, and the terminal. Preview pages keep
        their own appearance.
      </p>
    </div>
  );
}

function ThemeSample({ id }: { id: string }) {
  const column = 'flex min-w-0 flex-col gap-1.25 px-0.75 py-1.5';
  const mark = 'block h-0.5 w-4/5 bg-subtle';
  return (
    <span
      className="grid h-19 grid-cols-[10px_1fr_1.4fr_0.65fr] gap-0.5 overflow-hidden rounded-xs border border-border bg-canvas p-1"
      data-theme-preview={id}
      aria-hidden="true"
    >
      <span className="border-r border-border bg-sidebar" />
      <span className={cn(column, 'bg-surface-panel')}>
        {[0, 1, 2].map((index) => (
          <i key={index} className={mark} />
        ))}
      </span>
      <span className={cn(column, 'bg-editor px-1')}>
        <i className={cn(mark, 'bg-accent')} />
        <i className={cn(mark, 'w-3/5')} />
        <i className={mark} />
        <span className="mt-0.5 flex-1 border-t border-border bg-terminal" />
      </span>
      <span className={cn(column, 'bg-surface-inset')}>
        {[0, 1, 2, 3].map((index) => (
          <i key={index} className={mark} />
        ))}
      </span>
    </span>
  );
}
