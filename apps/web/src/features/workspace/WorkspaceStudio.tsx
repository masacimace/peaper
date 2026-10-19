import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { ChevronRight, FolderCode, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import type { Session } from '@peaper/shared';
import { Sidebar, type NavigationSection } from '../../components/Sidebar';
import { PanelMenu } from '../../layout/PanelMenu';
import { ResizeHandle } from '../../layout/ResizeHandle';
import { resizeLayout, type FocusedPanel, type PanelId } from '../../layout/layout';
import { useViewportWidth, useWorkspaceLayout } from '../../layout/useWorkspaceLayout';
import type { RuntimeSnapshot } from '../../lib/useRuntime';
import { FileExplorer } from '../files/FileExplorer';
import { EditorPanel } from '../editor/EditorPanel';
import { useEditorFiles } from '../editor/useEditorFiles';
import { AgentPanel } from '../agent/AgentPanel';
import { PreviewPanel } from '../preview/PreviewPanel';
import { SessionsPage } from '../sessions/SessionsPage';
import { NewSessionDialog } from '../sessions/NewSessionDialog';
import { SettingsPage } from '../settings/SettingsPage';
import { RuntimeDialog } from '../runtime/RuntimeDialog';
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
  const [activeId, setActiveId] = useState<string | null>(
    () =>
      sessionStorage.getItem(`peaper:session:${workspace.id}`) ||
      sessionStorage.getItem('peaper:active-session'),
  );
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const editor = useEditorFiles(workspace.id);
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
    sessionStorage.setItem(`peaper:session:${workspace.id}`, session.id);
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
      className="studio"
      style={{ '--navigation-width': `${narrow ? 52 : navWidth}px` } as CSSProperties}
    >
      {mobileNavigation && narrow && (
        <button
          className="navigation-scrim"
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
      <main className="studio-main">
        <header className="workspace-toolbar">
          <div className="toolbar-location">
            <button
              className="icon-button"
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              aria-expanded={!collapsed}
              title={`${collapsed ? 'Expand' : 'Collapse'} navigation (Ctrl+B)`}
              onClick={toggleSidebar}
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
            <span className="toolbar-divider" />
            <FolderCode size={14} />
            <span className="project-name">{workspace.name}</span>
            <ChevronRight size={12} />
            <span className="current-section">
              {section.charAt(0).toUpperCase() + section.slice(1)}
            </span>
          </div>
          <div className="toolbar-right">
            {focus && section === 'workspace' && (
              <button
                className="text-button restore-layout"
                onClick={() => setLayout((previous) => ({ ...previous, maximized: null }))}
              >
                Restore layout
              </button>
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
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button className="icon-button" aria-label="Dismiss error" onClick={onClearError}>
              <X size={14} />
            </button>
          </div>
        )}
        <div className="workbench" hidden={section !== 'workspace'}>
          <AgentPanel
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
          <div className="work-surface" hidden={!showSurface}>
            <div className="editor-row" hidden={!showTop}>
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
              className="bottom-row"
              hidden={!showBottom}
              ref={bottom}
              style={{
                height: showTop ? layout.sizes.bottom : '100%',
                maxHeight: showTop ? '56%' : '100%',
              }}
            >
              <div
                className="terminal-slot"
                hidden={!show.terminal}
                style={{ flex: show.preview ? layout.sizes.bottomSplit : 1 }}
              >
                {terminalMounted && (
                  <Suspense fallback={<div className="panel-loading">Opening terminal…</div>}>
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
                className="preview-slot"
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
        <div className="manager-container" hidden={section === 'workspace'}>
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
          {(section === 'skills' || section === 'memory' || section === 'integrations') && (
            <ModulePage section={section} onWorkspace={() => navigate('workspace')} />
          )}
        </div>
        <footer className="statusbar">
          <div>
            <span className={`status-dot ${connected ? '' : 'warning-dot'}`} />
            <span>{connected ? 'Local runtime' : 'Reconnecting'}</span>
            <span className="statusbar-separator" />
            <span className="statusbar-project">{workspace.name}</span>
          </div>
          <div>
            {editor.file && (
              <>
                <span>
                  Ln {cursor.line}, Col {cursor.column}
                </span>
                <span className="statusbar-separator" />
                <span>UTF-8</span>
                <span>{editor.file.language}</span>
              </>
            )}
            <span className="statusbar-separator" />
            <span>Read only</span>
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
