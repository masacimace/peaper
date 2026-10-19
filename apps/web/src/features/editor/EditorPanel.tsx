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
import { lazy, Suspense, useState } from 'react';
import { Button, IconButton } from '../../components/ui/Button';
import { cn } from '../../components/ui/cn';
import { EmptyState, LoadingState } from '../../components/ui/EmptyState';
import { FileIcon } from '../files/FileIcon';
import { EditorErrorBoundary } from './EditorErrorBoundary';
import type { useEditorFiles } from './useEditorFiles';

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
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-editor"
      aria-label="Editor"
      hidden={hidden}
    >
      <header className="flex h-panel-header min-h-panel-header items-center justify-between border-b border-border-subtle bg-surface-inset">
        <div
          className="flex h-full min-w-0 [scrollbar-width:none] overflow-x-auto"
          role="tablist"
          aria-label="Open files"
        >
          {editor.tabs.length ? (
            editor.tabs.map((path) => (
              <div
                className={cn(
                  'relative flex shrink-0 items-center border-r border-border-subtle bg-surface-inset text-muted',
                  path === editor.activePath &&
                    'bg-editor text-strong before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-accent',
                )}
                key={path}
              >
                <button
                  className="flex h-full max-w-45 items-center gap-1.75 pr-1.25 pl-3 text-tree"
                  role="tab"
                  aria-selected={path === editor.activePath}
                  title={path}
                  onClick={() => editor.setActivePath(path)}
                >
                  <FileIcon name={path.split('/').pop() || path} />
                  <span className="truncate">{path.split('/').pop()}</span>
                </button>
                <button
                  className="mr-1 grid size-6 shrink-0 place-items-center rounded-xs text-subtle hover:bg-surface-hover hover:text-foreground"
                  aria-label={`Close ${path}`}
                  onClick={() => editor.closeFile(path)}
                >
                  <X size={12} />
                </button>
              </div>
            ))
          ) : (
            <span className="self-center pl-3.25 text-caption text-muted">Workspace</span>
          )}
        </div>
        <div className="flex h-full shrink-0 items-center gap-px border-l border-border-subtle bg-surface-panel px-1.25">
          <IconButton
            className={cn(wrap && 'bg-surface-selected text-strong')}
            aria-label="Toggle word wrap"
            title="Word wrap"
            onClick={() => setWrap(!wrap)}
          >
            <WrapText size={14} />
          </IconButton>
          {editor.activePath && (
            <IconButton
              aria-label="Refresh file"
              title="Reload file from disk"
              onClick={editor.refresh}
            >
              <RefreshCw size={13} />
            </IconButton>
          )}
          <IconButton
            aria-label={maximized ? 'Restore Editor' : 'Expand Editor'}
            title={maximized ? 'Restore Editor' : 'Expand Editor'}
            onClick={onMaximize}
          >
            {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </IconButton>
        </div>
      </header>
      {editor.activePath && (
        <div className="flex h-7 shrink-0 items-center gap-1.5 overflow-hidden border-b border-border-subtle px-3 text-micro text-muted max-tablet:gap-1 max-tablet:text-mini">
          {fragments.map((part, index) => (
            <span
              key={index}
              className={cn(
                'inline-flex items-center gap-1.25 whitespace-nowrap',
                index < fragments.length - 2 && 'max-tablet:hidden',
              )}
            >
              {index > 0 && <ChevronRight size={11} />}
              {index === fragments.length - 1 && <FileIcon name={part} size={12} />}
              {part}
            </span>
          ))}
          <span className="ml-auto inline-flex items-center gap-1.25 bg-editor pl-2.5 text-mini whitespace-nowrap text-subtle">
            <Eye size={11} />
            Read only
          </span>
        </div>
      )}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {!editor.activePath ? (
          <div className="m-auto max-w-100 px-6.25 py-11.25 text-center text-subtle max-compact:px-2.5 max-compact:py-5">
            <Box size={37} strokeWidth={1} className="mx-auto mb-5 block text-accent" />
            <h1 className="text-title font-[450] tracking-[-0.4px] text-strong max-compact:text-[16px]">
              Your workspace is ready.
            </h1>
            <p className="mt-2.25 text-label leading-[1.7] text-muted max-compact:text-caption">
              Open a file to explore your project.
            </p>
            <Button variant="text" className="mt-3.5 text-caption" onClick={onOpenFiles}>
              <FolderOpen size={14} />
              Browse files
            </Button>
            <div className="mx-auto mt-8 flex max-w-56.25 flex-col gap-2.5">
              {[
                ['Toggle sidebar', 'Ctrl B'],
                ['New session', 'Ctrl K'],
                ['Toggle terminal', 'Ctrl `'],
              ].map(([label, shortcut]) => (
                <span className="flex justify-between gap-8.75 text-micro" key={label}>
                  {label}
                  <kbd className="font-mono text-mini text-muted">{shortcut}</kbd>
                </span>
              ))}
            </div>
          </div>
        ) : editor.error ? (
          <EmptyState
            icon={Eye}
            iconSize={24}
            title="Could not display this file"
            description={editor.error}
          >
            <Button className="min-h-6.75 text-caption" onClick={editor.refresh}>
              Try again
            </Button>
          </EmptyState>
        ) : editor.file ? (
          <EditorErrorBoundary key={editor.file.path}>
            <Suspense fallback={<LoadingState>Loading editor…</LoadingState>}>
              <CodeEditor file={editor.file} wrap={wrap} onPosition={onPosition} />
            </Suspense>
          </EditorErrorBoundary>
        ) : (
          <LoadingState>Reading file…</LoadingState>
        )}
        {editor.loading && editor.file && (
          <span className="absolute top-1.5 right-4.5 bg-surface-raised px-1.75 py-1 text-micro">
            Refreshing…
          </span>
        )}
      </div>
    </section>
  );
}
