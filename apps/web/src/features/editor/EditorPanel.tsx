import { lazy, Suspense, useState } from 'react';
import {
  Box,
  ChevronRight,
  Eye,
  FolderOpen,
  Maximize2,
  Minimize2,
  RefreshCw,
  WrapText,
  X,
} from 'lucide-react';
import { FileIcon } from '../files/FileIcon';
import type { useEditorFiles } from './useEditorFiles';
import { EditorErrorBoundary } from './EditorErrorBoundary';

const CodeEditor = lazy(() => import('./CodeEditor'));
export function EditorPanel({
  editor,
  hidden,
  maximized,
  onMaximize,
  onOpenFiles,
  onPosition,
}: {
  editor: ReturnType<typeof useEditorFiles>;
  hidden: boolean;
  maximized: boolean;
  onMaximize: () => void;
  onOpenFiles: () => void;
  onPosition: (line: number, column: number) => void;
}) {
  const [wrap, setWrap] = useState(false);
  const fragments = editor.activePath?.split('/') || [];
  return (
    <section className="panel editor-panel" aria-label="Editor" hidden={hidden}>
      <header className="editor-tabs-header">
        <div className="editor-tabs" role="tablist" aria-label="Open files">
          {editor.tabs.length ? (
            editor.tabs.map((path) => (
              <div
                className={`editor-tab ${path === editor.activePath ? 'active' : ''}`}
                key={path}
              >
                <button
                  role="tab"
                  aria-selected={path === editor.activePath}
                  title={path}
                  onClick={() => editor.setActivePath(path)}
                >
                  <FileIcon name={path.split('/').pop() || path} />
                  <span>{path.split('/').pop()}</span>
                </button>
                <button
                  className="tab-close"
                  aria-label={`Close ${path}`}
                  onClick={() => editor.closeFile(path)}
                >
                  <X size={12} />
                </button>
              </div>
            ))
          ) : (
            <span className="editor-placeholder-tab">Workspace</span>
          )}
        </div>
        <div className="panel-actions">
          <button
            className={`icon-button ${wrap ? 'active' : ''}`}
            aria-label="Toggle word wrap"
            title="Word wrap"
            onClick={() => setWrap(!wrap)}
          >
            <WrapText size={14} />
          </button>
          {editor.activePath && (
            <button
              className="icon-button"
              aria-label="Refresh file"
              title="Reload file from disk"
              onClick={editor.refresh}
            >
              <RefreshCw size={13} />
            </button>
          )}
          <button
            className="icon-button"
            aria-label={maximized ? 'Restore Editor' : 'Expand Editor'}
            title={maximized ? 'Restore Editor' : 'Expand Editor'}
            onClick={onMaximize}
          >
            {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </header>
      {editor.activePath && (
        <div className="editor-breadcrumbs">
          {fragments.map((part, index) => (
            <span key={index}>
              {index > 0 && <ChevronRight size={11} />}
              {index === fragments.length - 1 && <FileIcon name={part} size={12} />}
              {part}
            </span>
          ))}
          <span className="read-only-label">
            <Eye size={11} />
            Read only
          </span>
        </div>
      )}
      <div className="editor-surface">
        {!editor.activePath ? (
          <div className="editor-welcome">
            <Box size={37} strokeWidth={1} />
            <h1>Your workspace is ready.</h1>
            <p>Open a file to explore your project.</p>
            <button className="text-button" onClick={onOpenFiles}>
              <FolderOpen size={14} />
              Browse files
            </button>
            <div className="workspace-shortcuts">
              <span>
                Toggle sidebar<kbd>Ctrl B</kbd>
              </span>
              <span>
                New session<kbd>Ctrl K</kbd>
              </span>
              <span>
                Toggle terminal<kbd>Ctrl `</kbd>
              </span>
            </div>
          </div>
        ) : editor.error ? (
          <div className="panel-empty">
            <Eye size={24} strokeWidth={1.3} />
            <h3>Could not display this file</h3>
            <p>{editor.error}</p>
            <button className="secondary-button" onClick={editor.refresh}>
              Try again
            </button>
          </div>
        ) : editor.file ? (
          <EditorErrorBoundary key={editor.file.path}>
            <Suspense fallback={<div className="panel-loading">Loading editor…</div>}>
              <CodeEditor file={editor.file} wrap={wrap} onPosition={onPosition} />
            </Suspense>
          </EditorErrorBoundary>
        ) : (
          <div className="panel-loading">Reading file…</div>
        )}
        {editor.loading && editor.file && (
          <span className="file-loading-indicator">Refreshing…</span>
        )}
      </div>
    </section>
  );
}
