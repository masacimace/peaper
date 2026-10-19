import { useState } from 'react';
import { ArrowUpRight, Check, Pencil, PlugZap, Plus, RefreshCw } from 'lucide-react';
import type { ManagedModel, ModelState, ProviderConnection } from '@peaper/shared';
import { Page, PageHeader } from '../../components/ui/Page';
import { Button, IconButton } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Status';
import { EmptyState, LoadingState } from '../../components/ui/EmptyState';
import { ErrorNotice } from '../../components/ui/Notice';
import { cn } from '../../components/ui/cn';
import { api } from '../../lib/api';
import type { useModels } from './useModels';
import { ConnectionDialog } from './ConnectionDialog';
import { ModelCatalog } from './ModelCatalog';
import { ModelDetails } from './ModelDetails';
import { ModelDefaults } from './ModelDefaults';
import { ManualModelDialog } from './ManualModelDialog';

export function ModelsPage({ controller }: { controller: ReturnType<typeof useModels> }) {
  const { state, setState, loaded } = controller;
  const [tab, setTab] = useState<'providers' | 'catalog' | 'defaults'>('providers');
  const [editing, setEditing] = useState<ProviderConnection | 'new' | null>(null);
  const [manual, setManual] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function action(key: string, execute: () => Promise<ModelState>, success: string) {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      setState(await execute());
      setNotice(success);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Request failed.');
      await controller.refresh().catch(() => {});
    } finally {
      setBusy('');
    }
  }
  function update(model: ManagedModel, values: { favorite?: boolean; showInChat?: boolean }) {
    void action(
      model.id,
      () => api.updateModel(model.id, values),
      values.showInChat === undefined ? 'Favorites updated.' : 'Chat model picker updated.',
    );
  }
  const selected = state.models.find((model) => model.id === detail);
  if (!loaded)
    return controller.error ? (
      <Page>
        <ErrorNotice>{controller.error}</ErrorNotice>
        <Button onClick={() => void controller.refresh().catch(() => {})}>Retry</Button>
      </Page>
    ) : (
      <LoadingState>Loading models…</LoadingState>
    );
  return (
    <Page className="max-w-300">
      <PageHeader
        kicker="MODEL WORKSPACE"
        title="Models"
        description="Your providers, models, and the way you work."
      >
        <Button
          variant="primary"
          className="max-compact:px-2 max-compact:text-micro"
          onClick={() => setEditing('new')}
        >
          <Plus size={14} />
          Add provider
        </Button>
      </PageHeader>
      <div
        role="tablist"
        aria-label="Model management"
        className="mb-6 flex gap-5 border-b border-border"
      >
        {(
          [
            { id: 'providers', label: 'Providers', count: state.connections.length },
            { id: 'catalog', label: 'Model Catalog', count: state.models.length },
            { id: 'defaults', label: 'Defaults' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => {
              setTab(item.id);
              setError('');
              setNotice('');
            }}
            className={cn(
              'relative flex items-center gap-2 pb-3 text-label text-muted hover:text-foreground',
              tab === item.id &&
                'text-strong after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-accent',
            )}
          >
            {item.label}
            {'count' in item && <span className="text-micro text-subtle">{item.count}</span>}
          </button>
        ))}
      </div>
      {error && <ErrorNotice className="mb-4">{error}</ErrorNotice>}
      {notice && (
        <p className="mb-4 text-caption text-success" role="status">
          {notice}
        </p>
      )}
      {tab === 'providers' && (
        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-label text-muted">
              Keep personal, work, and local connections together.
            </p>
            <span className="shrink-0 text-caption text-subtle">
              {state.connections.filter((item) => item.enabled).length} enabled
            </span>
          </div>
          {!state.connections.length ? (
            <EmptyState
              variant="page"
              icon={PlugZap}
              iconSize={30}
              title="Connect your first provider"
              description="Add OpenRouter or a custom compatible endpoint, then choose the models you want to use."
            >
              <Button onClick={() => setEditing('new')}>
                <Plus size={13} />
                Add provider
              </Button>
            </EmptyState>
          ) : (
            <div className="divide-y divide-border-subtle border-y border-border-subtle">
              {state.connections.map((connection) => {
                const models = state.models.filter((model) => model.connectionId === connection.id);
                const tested = models.filter((model) => model.verifiedAt).length;
                return (
                  <section
                    key={connection.id}
                    aria-label={`Connection ${connection.name}`}
                    className="py-5"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-sm border border-border bg-surface-inset text-muted">
                        <PlugZap size={17} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-small font-medium text-strong">{connection.name}</h2>
                          <Badge className="text-micro">
                            {!connection.enabled ? (
                              'Disabled'
                            ) : connection.error ? (
                              'Check connection'
                            ) : connection.checkedAt ? (
                              <>
                                <Check size={10} />
                                Connected
                              </>
                            ) : (
                              'Not checked'
                            )}
                          </Badge>
                        </div>
                        <p className="mt-1 text-caption text-muted">
                          {connection.kind === 'openrouter' ? 'OpenRouter' : 'Custom compatible'} ·{' '}
                          {models.length} models · {tested} tested
                        </p>
                        <p
                          className="mt-1 truncate font-mono text-micro text-subtle"
                          title={connection.baseURL}
                        >
                          {connection.baseURL}
                        </p>
                      </div>
                      <IconButton
                        aria-label={`Edit ${connection.name}`}
                        title="Edit provider"
                        onClick={() => setEditing(connection)}
                      >
                        <Pencil size={14} />
                      </IconButton>
                    </div>
                    {connection.error && (
                      <p className="mt-3 text-caption leading-relaxed text-danger">
                        {connection.error}
                      </p>
                    )}
                    <div className="mt-4 flex flex-wrap items-center gap-2 pl-11 max-compact:pl-0">
                      <Button
                        className="min-h-7 text-caption"
                        disabled={!connection.enabled || busy === connection.id}
                        onClick={() =>
                          void action(
                            connection.id,
                            () => api.refreshModels(connection.id),
                            'Connection checked and model catalog refreshed.',
                          )
                        }
                      >
                        <RefreshCw
                          size={12}
                          className={cn(busy === connection.id && 'animate-spin')}
                        />
                        {busy === connection.id
                          ? 'Checking…'
                          : connection.catalogUpdatedAt
                            ? 'Refresh models'
                            : 'Test connection'}
                      </Button>
                      <Button
                        variant="text"
                        className="text-caption"
                        onClick={() => {
                          setTab('catalog');
                          setNotice('');
                        }}
                      >
                        View models
                        <ArrowUpRight size={12} />
                      </Button>
                      <Button
                        variant="text"
                        className="ml-auto text-caption"
                        disabled={busy === connection.id}
                        onClick={() =>
                          void action(
                            connection.id,
                            () =>
                              api.saveConnection(
                                {
                                  name: connection.name,
                                  kind: connection.kind,
                                  baseURL: connection.baseURL,
                                  enabled: !connection.enabled,
                                },
                                connection.id,
                              ),
                            connection.enabled
                              ? 'Connection disabled. Active tasks keep their original configuration.'
                              : 'Connection enabled.',
                          )
                        }
                      >
                        {connection.enabled ? 'Disable' : 'Enable'}
                      </Button>
                    </div>
                    <p className="mt-3 pl-11 text-micro text-subtle max-compact:pl-0">
                      {connection.catalogUpdatedAt
                        ? `Catalog refreshed ${new Date(connection.catalogUpdatedAt).toLocaleString()}.`
                        : 'Connection checks read the model catalog; model capability tests are separate.'}
                    </p>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      )}
      {tab === 'catalog' && (
        <ModelCatalog
          state={state}
          busy={busy}
          onUpdate={update}
          onDetails={setDetail}
          onManual={() => setManual(true)}
        />
      )}
      {tab === 'defaults' && (
        <ModelDefaults
          key={`${state.defaults.modelId}:${state.defaults.effort}`}
          state={state}
          busy={busy === 'defaults'}
          onSave={(defaults) =>
            void action(
              'defaults',
              () => api.saveDefaults(defaults),
              'Defaults saved for new sessions.',
            )
          }
        />
      )}
      {editing && (
        <ConnectionDialog
          connection={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={(value) => {
            setState(value);
            setNotice(
              'Provider saved. Test the connection to discover models, or enter a model ID manually.',
            );
          }}
        />
      )}
      {manual && (
        <ManualModelDialog
          state={state}
          onClose={() => setManual(false)}
          onSaved={(value) => {
            setState(value);
            setNotice('Model added. Open its details to test it and enable it in chat.');
          }}
        />
      )}
      {selected && (
        <ModelDetails
          key={selected.id}
          model={selected}
          connection={state.connections.find((item) => item.id === selected.connectionId)}
          onClose={() => setDetail(null)}
          onSaved={setState}
        />
      )}
    </Page>
  );
}
