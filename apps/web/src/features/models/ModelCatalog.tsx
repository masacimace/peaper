import { useState } from 'react';
import { ChevronLeft, ChevronRight, Search, Star } from 'lucide-react';
import type { ManagedModel, ModelState } from '@peaper/shared';
import { Button, IconButton } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Field';
import { EmptyState } from '../../components/ui/EmptyState';
import { cn } from '../../components/ui/cn';
import { tokenPrice } from './format';
export function ModelCatalog({
  state,
  busy,
  onUpdate,
  onDetails,
  onManual,
}: {
  state: ModelState;
  busy: string;
  onUpdate: (model: ManagedModel, values: { favorite?: boolean; showInChat?: boolean }) => void;
  onDetails: (id: string) => void;
  onManual: () => void;
}) {
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState('all');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0);
  const matches = state.models
    .filter(
      (model) =>
        (provider === 'all' || model.connectionId === provider) &&
        (filter === 'all' ||
          (filter === 'favorites' && model.favorite) ||
          (filter === 'chat' && model.showInChat)) &&
        `${model.name} ${model.modelId}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(matches.length / 40) - 1));
  const rows = matches.slice(currentPage * 40, currentPage * 40 + 40);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex min-w-45 flex-1 items-center gap-2 rounded-sm border border-border bg-surface-inset px-2 text-muted max-compact:basis-full">
          <Search size={14} />
          <Input
            aria-label="Search model catalog"
            placeholder="Search model names or IDs…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            className="border-0 bg-transparent px-0"
          />
        </label>
        <Select
          aria-label="Filter by provider"
          value={provider}
          onChange={(event) => {
            setProvider(event.target.value);
            setPage(0);
          }}
          className="w-43 max-compact:flex-1"
        >
          <option value="all">All providers</option>
          {state.connections.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filter models"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
            setPage(0);
          }}
          className="w-33 max-compact:flex-1"
        >
          <option value="all">All models</option>
          <option value="favorites">Favorites</option>
          <option value="chat">Shown in chat</option>
        </Select>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-caption text-subtle">
        <span>{matches.length} models · prices in USD per 1M tokens</span>
        <Button variant="text" className="text-caption" onClick={onManual}>
          Enter model ID manually
        </Button>
      </div>
      {!rows.length ? (
        <EmptyState
          variant="page"
          title={state.models.length ? 'No matching models' : 'Your model catalog is empty'}
          description={
            state.models.length
              ? 'Try another name or change the filters.'
              : 'Refresh a provider’s models, or enter a model ID manually.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full table-fixed border-collapse text-left text-label">
            <thead className="bg-surface-inset text-micro font-normal text-subtle">
              <tr>
                <th className="w-9 px-2 py-2">
                  <span className="sr-only">Favorite</span>
                </th>
                <th className="px-2 py-2 font-normal">MODEL</th>
                <th className="w-29 px-2 py-2 font-normal max-tablet:hidden">PROVIDER</th>
                <th className="w-24 px-2 py-2 font-normal max-compact:hidden">CAPABILITIES</th>
                <th className="w-22 px-2 py-2 font-normal max-tablet:hidden">CONTEXT</th>
                <th className="w-26 px-2 py-2 font-normal max-compact:hidden">INPUT / OUTPUT</th>
                <th className="w-18 px-2 py-2 text-center font-normal">IN CHAT</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((model) => {
                const connection = state.connections.find((item) => item.id === model.connectionId);
                const unavailable = !model.available || !connection?.enabled;
                return (
                  <tr
                    key={model.id}
                    className={cn(
                      'border-t border-border-subtle hover:bg-surface-hover',
                      unavailable && 'text-subtle',
                    )}
                  >
                    <td className="px-2 py-3">
                      <IconButton
                        aria-label={`${model.favorite ? 'Unfavorite' : 'Favorite'} ${model.name}`}
                        title="Favorite model"
                        disabled={busy === model.id}
                        onClick={() => onUpdate(model, { favorite: !model.favorite })}
                      >
                        <Star
                          size={13}
                          className={cn(model.favorite && 'fill-accent text-accent')}
                        />
                      </IconButton>
                    </td>
                    <td className="min-w-0 px-2 py-3">
                      <button
                        className="block w-full min-w-0 text-left"
                        onClick={() => onDetails(model.id)}
                      >
                        <span className="block truncate font-medium text-foreground">
                          {model.name}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-micro text-subtle">
                          {model.modelId}
                        </span>
                        <span className="mt-1 block text-micro text-muted">
                          {unavailable ? 'Unavailable' : model.verifiedAt ? 'Tested' : 'Not tested'}
                          <span className="tablet:hidden"> · {connection?.name}</span>
                        </span>
                      </button>
                    </td>
                    <td
                      className="truncate px-2 py-3 text-caption text-muted max-tablet:hidden"
                      title={connection?.name}
                    >
                      {connection?.name}
                    </td>
                    <td className="px-2 py-3 text-micro text-muted max-compact:hidden">
                      <span className="block">
                        {model.toolCalling === null
                          ? 'Tools unknown'
                          : model.toolCalling
                            ? 'Tools'
                            : 'No tools'}
                      </span>
                      {model.reasoning && <span className="mt-1 block">Reasoning</span>}
                    </td>
                    <td className="px-2 py-3 text-caption text-muted max-tablet:hidden">
                      {model.contextWindow ? model.contextWindow.toLocaleString() : '—'}
                    </td>
                    <td className="px-2 py-3 text-micro text-muted max-compact:hidden">
                      {tokenPrice(model.pricing.input)} / {tokenPrice(model.pricing.output)}
                    </td>
                    <td className="px-2 py-3 text-center">
                      <input
                        type="checkbox"
                        className="size-3.5 cursor-pointer accent-accent"
                        aria-label={`Show ${model.name} in chat`}
                        title={
                          model.toolCalling === false
                            ? 'Coding agents require tool calling'
                            : 'Show in chat model picker'
                        }
                        checked={model.showInChat}
                        disabled={busy === model.id || unavailable || model.toolCalling === false}
                        onChange={(event) => onUpdate(model, { showInChat: event.target.checked })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {matches.length > 40 && (
        <div className="mt-3 flex items-center justify-end gap-3 text-caption text-muted">
          <IconButton
            aria-label="Previous model page"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft size={14} />
          </IconButton>
          <span>
            Page {currentPage + 1} of {Math.ceil(matches.length / 40)}
          </span>
          <IconButton
            aria-label="Next model page"
            disabled={(currentPage + 1) * 40 >= matches.length}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight size={14} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
