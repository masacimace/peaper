import { Brand } from './components/Brand';
import { Button } from './components/ui/Button';
import { WorkspaceStudio } from './features/workspace/WorkspaceStudio';
import { useRuntime } from './lib/useRuntime';

export function App() {
  const runtime = useRuntime();
  if (!runtime.snapshot)
    return (
      <div className="h-full bg-canvas p-8">
        <Brand />
        <div className="mx-auto my-[18vh] max-w-110">
          <span className="text-mini font-medium tracking-[1.5px] text-subtle">
            LOCAL WORKSPACE
          </span>
          <h1 className="mt-3.75 mb-3.25 text-[25px] font-[450] tracking-[-0.6px] text-strong">
            {runtime.error ? 'Connect to your workspace' : 'Opening Peaper…'}
          </h1>
          <p className="text-small leading-[1.8] text-muted">
            {runtime.error || 'Connecting to the local runtime.'}
          </p>
          {runtime.error && (
            <Button variant="primary" className="mt-6" onClick={runtime.retry}>
              Try again
            </Button>
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
