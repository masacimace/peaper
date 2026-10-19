import type { Session } from '@peaper/shared';
import { ChevronRight, FolderCode, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Sidebar, type NavigationSection } from '../../components/Sidebar';
import { Button, IconButton } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/EmptyState';
import { StatusDot } from '../../components/ui/Status';
import { PanelMenu } from '../../layout/PanelMenu';
import { ResizeHandle } from '../../layout/ResizeHandle';
import { resizeLayout, type FocusedPanel, type PanelId } from '../../layout/layout';
import { useViewportWidth, useWorkspaceLayout } from '../../layout/useWorkspaceLayout';
import type { RuntimeSnapshot } from '../../lib/useRuntime';
import { AgentPanel } from '../agent/AgentPanel';
import { EditorPanel } from '../editor/EditorPanel';
import { useEditorFiles } from '../editor/useEditorFiles';
import { FileExplorer } from '../files/FileExplorer';
import { PreviewPanel } from '../preview/PreviewPanel';
import { RuntimeDialog } from '../runtime/RuntimeDialog';
import { NewSessionDialog } from '../sessions/NewSessionDialog';
import { SessionsPage } from '../sessions/SessionsPage';
import { SettingsPage } from '../settings/SettingsPage';
import { useModels } from '../models/useModels';
import { ModelsPage } from '../models/ModelsPage';
import { ModulePage } from './ModulePage';

const TerminalPanel = lazy(() => import('../terminal/TerminalPanel'));
export function WorkspaceStudio({
  snapshot,
  connected,
  error,
  onClearError,
  onRefreshSessions,
}: {
  snapshot: RuntimeSnapshot;
  connected: boolean;
  error: string;
  onClearError: () => void;
  onRefreshSessions: () => Promise<void>;
}) {
  const { workspace, health, sessions } = snapshot;
  const { layout, setLayout, reset } = useWorkspaceLayout(workspace.id);
  const width = useViewportWidth();
  const narrow = width < 680;
  const [mobileNavigation, setMobileNavigation] = useState(false);
  const [section, setSection] = useState<NavigationSection>('workspace');
  const [menuOpen, setMenuOpen] = useState(false);
  const [newSession, setNewSession] = useState(false);
  const [runtimeDetails, setRuntimeDetails] = useState(false);
  const [terminalMounted, setTerminalMounted] = useState(layout.visible.terminal);
  const [activeId, setActiveId] = useState<string | null>(() => {
    try {
      const id =
        sessionStorage.getItem(`peaper:session:${workspace.id}`) ||
        localStorage.getItem(`peaper:session:${workspace.id}`) ||
        sessionStorage.getItem('peaper:active-session');
      return sessions.some((session) => session.id === id) ? id : null;
    } catch {
      return null;
    }
  });
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const editor = useEditorFiles(workspace.id);
  const modelController = useModels(activeId);
  const bottom = useRef<HTMLDivElement>(null);
  const activeSession = sessions.find((session) => session.id === activeId);
  const collapsed = narrow ? !mobileNavigation : layout.sidebarCollapsed;
  const availableWidth = width - (collapsed ? 52 : 200);
  const compact = availableWidth < 590;
  const canShowFiles = availableWidth >= 820;
  const focus = layout.maximized;
  const show = {
    files: focus === 'files' || (!focus && layout.visible.files && canShowFiles),
    editor: !focus || focus === 'editor',
    agent: focus === 'agent' || (!focus && layout.visible.agent && !compact),
    terminal: focus === 'terminal' || (!focus && layout.visible.terminal),
    preview:
      focus === 'preview' ||
      (!focus && layout.visible.preview && (!compact || !layout.visible.terminal)),
  };
  const showSurface = show.editor || show.files || show.terminal || show.preview;
  const showTop = show.editor || show.files;
  const showBottom = show.terminal || show.preview;

  const togglePanel = useCallback(
    (id: PanelId) => {
      if (id === 'terminal') setTerminalMounted(true);
      setSection('workspace');
      setLayout((previous) => {
        if (compact || (id === 'files' && !canShowFiles))
          return {
            ...previous,
            visible: { ...previous.visible, [id]: true },
            maximized: previous.maximized === id ? null : id,
          };
        return {
          ...previous,
          maximized: null,
          visible: { ...previous.visible, [id]: !previous.visible[id] },
        };
      });
      setMenuOpen(false);
    },
    [compact, canShowFiles, setLayout],
  );
  const toggleSidebar = useCallback(() => {
    if (narrow) setMobileNavigation((value) => !value);
    else setLayout((previous) => ({ ...previous, sidebarCollapsed: !previous.sidebarCollapsed }));
  }, [narrow, setLayout]);
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        toggleSidebar();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setNewSession(true);
      }
      if ((event.ctrlKey || event.metaKey) && event.key === '`') {
        event.preventDefault();
        togglePanel('terminal');
      }
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setMobileNavigation(false);
      }
    }
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [togglePanel, toggleSidebar]);
  function navigate(next: NavigationSection) {
    setSection(next);
    setMobileNavigation(false);
    setMenuOpen(false);
  }
  function selectSession(session: Session) {
    setActiveId(session.id);
    try {
      sessionStorage.setItem(`peaper:session:${workspace.id}`, session.id);
      localStorage.setItem(`peaper:session:${workspace.id}`, session.id);
    } catch {
      /* Backend session history is retained. */
    }
    navigate('workspace');
    setLayout((previous) => ({
      ...previous,
      visible: { ...previous.visible, agent: true },
      maximized: compact ? 'agent' : null,
    }));
  }
  function sessionCreated(session: Session) {
    selectSession(session);
    setNewSession(false);
    void onRefreshSessions();
  }
  function maximize(id: FocusedPanel) {
    if (id === 'terminal') setTerminalMounted(true);
    setLayout((previous) => ({ ...previous, maximized: previous.maximized === id ? null : id }));
  }
  function hide(id: PanelId) {
    setLayout((previous) => ({
      ...previous,
      visible: { ...previous.visible, [id]: false },
      maximized: previous.maximized === id ? null : previous.maximized,
    }));
  }
  function resetLayout() {
    reset();
    setTerminalMounted(true);
  }
  function resize(name: keyof typeof layout.sizes, delta: number) {
    setLayout((previous) => resizeLayout(previous, name, delta));
  }
  const onPosition = useCallback((line: number, column: number) => setCursor({ line, column }), []);
  const navWidth = collapsed ? 52 : 200;
  return (
    <div
      className="grid size-full grid-cols-[var(--navigation-width)_minmax(0,1fr)] transition-[grid-template-columns] duration-(--duration-fast)"
      style={{ '--navigation-width': `${narrow ? 52 : navWidth}px` } as CSSProperties}
    >
      {mobileNavigation && narrow && (
        <button
          className="fixed inset-0 z-50 bg-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNavigation(false)}
        />
      )}
      <Sidebar
        workspace={workspace}
        health={health}
        collapsed={collapsed}
        section={section}
        sessionCount={sessions.length}
        connected={connected}
        onNavigate={navigate}
        onNewSession={() => setNewSession(true)}
        onDetails={() => setRuntimeDetails(true)}
      />
      <main className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <header className="flex h-9.25 min-h-9.25 items-center justify-between gap-3 border-b border-border bg-surface-toolbar pr-2.25 pl-1.75 max-compact:gap-0.75 max-compact:pr-1.25">
          <div className="flex min-w-0 items-center gap-2.25 text-caption text-subtle max-compact:gap-1.5">
            <IconButton
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              aria-expanded={!collapsed}
              title={`${collapsed ? 'Expand' : 'Collapse'} navigation (Ctrl+B)`}
              onClick={toggleSidebar}
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </IconButton>
            <span className="mx-px h-3.25 w-px bg-border max-compact:hidden" />
            <FolderCode size={14} className="max-compact:hidden" />
            <span className="max-w-60 truncate text-foreground max-workspace:max-w-50 max-compact:max-w-35">
              {workspace.name}
            </span>
            <ChevronRight size={12} className="max-compact:hidden" />
            <span className="text-muted max-compact:hidden">
              {section.charAt(0).toUpperCase() + section.slice(1)}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {focus && section === 'workspace' && (
              <Button
                variant="text"
                className="px-0.75 py-0.75 text-micro whitespace-nowrap max-compact:text-mini"
                onClick={() => setLayout((previous) => ({ ...previous, maximized: null }))}
              >
                Restore layout
              </Button>
            )}
            <PanelMenu
              open={menuOpen}
              setOpen={setMenuOpen}
              layout={layout}
              onToggle={togglePanel}
              onReset={resetLayout}
            />
          </div>
        </header>
        {error && (
          <div
            className="flex items-center justify-between gap-2.5 border-b border-danger-border bg-danger-soft px-3 py-1.25 text-label text-danger"
            role="alert"
          >
            <span>{error}</span>
            <IconButton aria-label="Dismiss error" onClick={onClearError}>
              <X size={14} />
            </IconButton>
          </div>
        )}
        <div className="flex min-h-0 min-w-0 flex-1" hidden={section !== 'workspace'}>
          <AgentPanel
            models={modelController}
            onSessionCreated={sessionCreated}
            workspace={workspace}
            session={activeSession}
            selectedFile={editor.activePath}
            hidden={!show.agent}
            width={layout.sizes.agent}
            maximized={focus === 'agent'}
            onMaximize={() => maximize('agent')}
            onClose={() => hide('agent')}
            onNewSession={() => setNewSession(true)}
            onSettings={() => navigate('settings')}
            onModels={() => navigate('models')}
          />
          {show.agent && showSurface && (
            <ResizeHandle
              label="Resize Agent panel"
              value={layout.sizes.agent}
              min={270}
              max={520}
              onResize={(delta) => resize('agent', delta)}
            />
          )}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col" hidden={!showSurface}>
            <div className="flex min-h-30 min-w-0 flex-1" hidden={!showTop}>
              <EditorPanel
                editor={editor}
                hidden={!show.editor}
                maximized={focus === 'editor'}
                onMaximize={() => maximize('editor')}
                onOpenFiles={() => {
                  setLayout((previous) => ({
                    ...previous,
                    visible: { ...previous.visible, files: true },
                    maximized: !canShowFiles ? 'files' : null,
                  }));
                }}
                onPosition={onPosition}
              />
              {show.editor && show.files && (
                <ResizeHandle
                  label="Resize Files panel"
                  value={layout.sizes.files}
                  min={150}
                  max={360}
                  inverted
                  onResize={(delta) => resize('files', delta)}
                />
              )}
              <FileExplorer
                workspace={workspace}
                selectedPath={editor.activePath}
                onOpenFile={(path) => {
                  editor.openFile(path);
                  if (focus === 'files')
                    setLayout((previous) => ({
                      ...previous,
                      maximized: compact ? 'editor' : null,
                    }));
                }}
                hidden={!show.files}
                width={layout.sizes.files}
                maximized={focus === 'files'}
                onMaximize={() => maximize('files')}
                onClose={() => hide('files')}
              />
            </div>
            {showTop && showBottom && (
              <ResizeHandle
                axis="y"
                label="Resize bottom panels"
                value={layout.sizes.bottom}
                min={150}
                max={600}
                inverted
                onResize={(delta) => resize('bottom', delta)}
              />
            )}
            <div
              className="flex min-h-32.5 min-w-0 shrink-0"
              hidden={!showBottom}
              ref={bottom}
              style={{
                height: showTop ? layout.sizes.bottom : '100%',
                maxHeight: showTop ? '56%' : '100%',
              }}
            >
              <div
                className="flex min-h-0 min-w-0 [&>section]:flex-1"
                hidden={!show.terminal}
                style={{ flex: show.preview ? layout.sizes.bottomSplit : 1 }}
              >
                {terminalMounted && (
                  <Suspense fallback={<LoadingState>Opening terminal…</LoadingState>}>
                    <TerminalPanel
                      hidden={!show.terminal}
                      maximized={focus === 'terminal'}
                      onMaximize={() => maximize('terminal')}
                      onClose={() => hide('terminal')}
                    />
                  </Suspense>
                )}
              </div>
              {show.terminal && show.preview && (
                <ResizeHandle
                  label="Resize Terminal and Preview"
                  value={layout.sizes.bottomSplit * 100}
                  min={25}
                  max={75}
                  onResize={(delta) =>
                    resize('bottomSplit', delta / (bottom.current?.clientWidth || 800))
                  }
                />
              )}
              <div
                className="flex min-h-0 min-w-0 [&>section]:flex-1"
                hidden={!show.preview}
                style={{ flex: show.terminal ? 1 - layout.sizes.bottomSplit : 1 }}
              >
                <PreviewPanel
                  workspaceId={workspace.id}
                  hidden={!show.preview}
                  maximized={focus === 'preview'}
                  onMaximize={() => maximize('preview')}
                  onClose={() => hide('preview')}
                />
              </div>
            </div>
          </div>
        </div>
        <div
          className="min-h-0 flex-1 overflow-auto bg-surface-panel"
          hidden={section === 'workspace'}
        >
          {section === 'sessions' && (
            <SessionsPage
              sessions={sessions}
              onSelect={selectSession}
              onNewSession={() => setNewSession(true)}
            />
          )}
          {section === 'settings' && (
            <SettingsPage
              workspace={workspace}
              health={health}
              onResetLayout={resetLayout}
              onRuntime={() => setRuntimeDetails(true)}
            />
          )}
          {section === 'models' && <ModelsPage controller={modelController} />}
          {(section === 'skills' || section === 'memory' || section === 'integrations') && (
            <ModulePage section={section} onWorkspace={() => navigate('workspace')} />
          )}
        </div>
        <footer className="flex h-5.75 min-h-5.75 items-center justify-between gap-4 border-t border-border bg-surface-toolbar px-2.5 text-mini text-muted max-compact:px-1.75 max-compact:text-tiny">
          <div className="flex min-w-0 items-center gap-2.5 whitespace-nowrap">
            <StatusDot warning={!connected} />
            <span>{connected ? 'Local runtime' : 'Reconnecting'}</span>
            <span className="h-2.25 w-px bg-border max-compact:hidden" />
            <span className="max-w-45 truncate max-compact:hidden">{workspace.name}</span>
          </div>
          <div className="flex min-w-0 items-center gap-2.5 whitespace-nowrap">
            {editor.file && (
              <>
                <span className="max-compact:hidden">
                  Ln {cursor.line}, Col {cursor.column}
                </span>
                <span className="h-2.25 w-px bg-border max-compact:hidden" />
                <span className="max-compact:hidden">UTF-8</span>
                <span className="max-compact:hidden">{editor.file.language}</span>
              </>
            )}
            <span className="h-2.25 w-px bg-border max-compact:hidden" />
            <span>Editor read only</span>
          </div>
        </footer>
      </main>
      {newSession && (
        <NewSessionDialog onClose={() => setNewSession(false)} onCreated={sessionCreated} />
      )}
      {runtimeDetails && <RuntimeDialog health={health} onClose={() => setRuntimeDetails(false)} />}
    </div>
  );
}
