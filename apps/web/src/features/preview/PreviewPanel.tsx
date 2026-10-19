import { useEffect, useRef, useState, type FormEvent } from 'react';
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
      className="preview-panel"
      hidden={hidden}
      maximized={maximized}
      onMaximize={onMaximize}
      onClose={onClose}
      actions={
        <>
          {source && (
            <button
              className="icon-button"
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
            </button>
          )}
          {source && (
            <a
              className="icon-button"
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
      <form className="preview-toolbar" onSubmit={navigate}>
        <button
          className="icon-button"
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
        </button>
        <Globe2 size={12} />
        <input
          ref={urlInput}
          aria-label="Preview URL"
          placeholder="http://localhost:3000"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          spellCheck={false}
        />
        <button
          className="icon-button"
          type="submit"
          title="Load local preview"
          aria-label="Load local preview"
        >
          <ArrowRight size={13} />
        </button>
        <label className="viewport-control">
          <span className="sr-only">Preview viewport</span>
          {viewport === '390' ? (
            <Smartphone size={13} />
          ) : viewport === '768' ? (
            <Tablet size={13} />
          ) : (
            <Monitor size={13} />
          )}
          <select
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
      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}
      <div
        className={`preview-canvas ${viewport !== 'auto' ? 'fixed-viewport' : ''} ${!source ? 'preview-canvas-empty' : ''}`}
      >
        {source ? (
          <>
            <iframe
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
              <div className="preview-loading">
                {slow
                  ? 'Still loading. Check your dev server or open the URL in your browser.'
                  : 'Loading preview…'}
              </div>
            )}
          </>
        ) : (
          <div className="panel-empty preview-empty">
            <Monitor size={25} strokeWidth={1.2} />
            <p>Start your dev server, then enter its local URL above.</p>
            <button className="text-button" onClick={() => urlInput.current?.focus()}>
              Enter a local URL
              <ArrowRight size={13} />
            </button>
          </div>
        )}
      </div>
      {source && (
        <div className="preview-footer">
          <span>{viewport === 'auto' ? 'Fit to panel' : `${viewport}px viewport`}</span>
          <a href={source} target="_blank" rel="noopener noreferrer">
            Page blank? Open in browser <ExternalLink size={10} />
          </a>
        </div>
      )}
    </Panel>
  );
}
