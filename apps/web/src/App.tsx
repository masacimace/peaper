import { useRuntime } from './lib/useRuntime';
import { Brand } from './components/Brand';
import { WorkspaceStudio } from './features/workspace/WorkspaceStudio';

export function App() {
  const runtime = useRuntime();
  if (!runtime.snapshot)
    return (
      <div className="connection-screen">
        <Brand />
        <div className="connection-card">
          <span className="section-kicker">LOCAL WORKSPACE</span>
          <h1>{runtime.error ? 'Connect to your workspace' : 'Opening Peaper…'}</h1>
          <p>{runtime.error || 'Connecting to the local runtime.'}</p>
          {runtime.error && (
            <button className="primary-button" onClick={runtime.retry}>
              Try again
            </button>
          )}
        </div>
      </div>
    );
  return (
    <WorkspaceStudio
      key={runtime.snapshot.workspace.id}
      snapshot={runtime.snapshot}
      connected={runtime.connected}
      error={runtime.error}
      onClearError={() => runtime.setError('')}
      onRefreshSessions={runtime.refreshSessions}
    />
  );
}
