import {
  ArrowRight,
  ExternalLink,
  Globe2,
  Monitor,
  RotateCw,
  Smartphone,
  Tablet,
  Unplug,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, IconButton } from '../../components/ui/Button';
import { cn } from '../../components/ui/cn';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorNotice } from '../../components/ui/Notice';
import { Panel } from '../../layout/Panel';
import { normalizePreviewUrl } from './preview-url';

export function PreviewPanel({
  workspaceId,
  hidden,
  maximized,
  onMaximize,
  onClose,
}: {
  workspaceId: string;
  hidden: boolean;
  maximized: boolean;
  onMaximize: () => void;
  onClose: () => void;
}) {
  const key = `peaper:preview:${workspaceId}`;
  const [source, setSource] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? normalizePreviewUrl(saved, location.origin) : '';
    } catch {
      return '';
    }
  });
  const [input, setInput] = useState(source);
  const [error, setError] = useState('');
  const [viewport, setViewport] = useState('auto');
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const urlInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(timer);
  }, [loading, source, reload]);
  function navigate(event: FormEvent) {
    event.preventDefault();
    try {
      const next = normalizePreviewUrl(input, location.origin);
      setSource(next);
      setInput(next);
      setError('');
      setLoading(true);
      setSlow(false);
      setReload((value) => value + 1);
      try {
        localStorage.setItem(key, next);
      } catch {
        /* The preview can run without saved preferences. */
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not load this URL');
    }
  }
  return (
    <Panel
      title="Preview"
      icon={Monitor}
      className="h-full bg-surface-inset"
      hidden={hidden}
      maximized={maximized}
      onMaximize={onMaximize}
      onClose={onClose}
      actions={
        <>
          {source && (
            <IconButton
              title="Disconnect preview"
              aria-label="Disconnect preview"
              onClick={() => {
                setSource('');
                setInput('');
                setError('');
                setLoading(false);
                setSlow(false);
                try {
                  localStorage.removeItem(key);
                } catch {
                  /* Preview disconnect also works without storage. */
                }
              }}
            >
              <Unplug size={13} />
            </IconButton>
          )}
          {source && (
            <a
              className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-surface-hover hover:text-foreground"
              href={source}
              target="_blank"
              rel="noopener noreferrer"
              title="Open preview in browser"
              aria-label="Open preview in browser"
            >
              <ExternalLink size={13} />
            </a>
          )}
        </>
      }
    >
      <form
        className="flex h-7.5 min-h-7.5 items-center gap-1.25 border-b border-border bg-surface-toolbar pr-1.5 pl-1 text-subtle"
        onSubmit={navigate}
      >
        <IconButton
          className="size-5.25"
          type="button"
          disabled={!source}
          aria-label="Reload preview"
          title="Reload preview"
          onClick={() => {
            setLoading(true);
            setSlow(false);
            setReload((value) => value + 1);
          }}
        >
          <RotateCw size={13} />
        </IconButton>
        <Globe2 size={12} />
        <input
          className="w-10 min-w-0 flex-1 border-0 bg-transparent px-0.25 py-0.75 text-micro text-foreground outline-none"
          ref={urlInput}
          aria-label="Preview URL"
          placeholder="http://localhost:3000"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          spellCheck={false}
        />
        <IconButton
          className="size-5.25"
          type="submit"
          title="Load local preview"
          aria-label="Load local preview"
        >
          <ArrowRight size={13} />
        </IconButton>
        <label className="flex items-center gap-0.5 border-l border-border pl-1.75">
          <span className="sr-only">Preview viewport</span>
          {viewport === '390' ? (
            <Smartphone size={13} />
          ) : viewport === '768' ? (
            <Tablet size={13} />
          ) : (
            <Monitor size={13} />
          )}
          <select
            className="h-5.75 w-12.25 cursor-pointer border-0 bg-transparent text-mini text-muted outline-none"
            aria-label="Preview viewport"
            value={viewport}
            onChange={(event) => setViewport(event.target.value)}
          >
            <option value="auto">Auto</option>
            <option value="1280">Desktop · 1280</option>
            <option value="768">Tablet · 768</option>
            <option value="390">Mobile · 390</option>
          </select>
        </label>
      </form>
      {error && <ErrorNotice role="alert">{error}</ErrorNotice>}
      <div
        className={cn(
          'relative min-h-0 flex-1 overflow-auto bg-preview',
          viewport !== 'auto' && 'bg-preview-gutter',
          !source && 'flex',
        )}
      >
        {source ? (
          <>
            <iframe
              className="mx-auto block h-full min-h-full border-0 bg-preview-page"
              key={`${source}:${reload}`}
              title="Application live preview"
              src={source}
              style={{ width: viewport === 'auto' ? '100%' : Number(viewport) }}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              referrerPolicy="no-referrer"
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setError(
                  'Could not display this page. Check the server or open it in your browser.',
                );
              }}
            />
            {loading && (
              <div className="absolute top-1.5 left-1/2 max-w-[95%] -translate-x-1/2 truncate rounded-sm border border-border-strong bg-surface-raised px-2 py-1.25 text-micro text-foreground">
                {slow
                  ? 'Still loading. Check your dev server or open the URL in your browser.'
                  : 'Loading preview…'}
              </div>
            )}
          </>
        ) : (
          <EmptyState
            className="max-w-57.5 p-3.75"
            icon={Monitor}
            description="Start your dev server, then enter its local URL above."
          >
            <Button variant="text" className="text-micro" onClick={() => urlInput.current?.focus()}>
              Enter a local URL
              <ArrowRight size={13} />
            </Button>
          </EmptyState>
        )}
      </div>
      {source && (
        <div className="flex min-h-5.25 items-center justify-between gap-2.25 border-t border-border px-2 py-0.75 text-tiny whitespace-nowrap text-subtle">
          <span>{viewport === 'auto' ? 'Fit to panel' : `${viewport}px viewport`}</span>
          <a
            className="flex items-center gap-1 text-muted hover:text-strong"
            href={source}
            target="_blank"
            rel="noopener noreferrer"
          >
            Page blank? Open in browser <ExternalLink size={10} />
          </a>
        </div>
      )}
    </Panel>
  );
}
