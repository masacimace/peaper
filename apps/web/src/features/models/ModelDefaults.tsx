import { useState } from 'react';
import {
  availableEfforts,
  effortLabel,
  validEffort,
  type ModelState,
  type ReasoningEffort,
} from '@peaper/shared';
import { Button } from '../../components/ui/Button';
import { Field, Select } from '../../components/ui/Field';
import { EmptyState } from '../../components/ui/EmptyState';

export function ModelDefaults({
  state,
  busy,
  onSave,
}: {
  state: ModelState;
  busy: boolean;
  onSave: (defaults: ModelState['defaults']) => void;
}) {
  const [modelId, setModelId] = useState(state.defaults.modelId ?? '');
  const [effort, setEffort] = useState<ReasoningEffort>(state.defaults.effort);
  const model = state.models.find((item) => item.id === modelId);
  const choices = state.models.filter(
    (item) =>
      item.available &&
      item.toolCalling !== false &&
      state.connections.some(
        (connection) => connection.id === item.connectionId && connection.enabled,
      ) &&
      (item.showInChat || item.id === state.defaults.modelId),
  );
  return (
    <div className="max-w-140">
      <h2 className="text-small font-medium text-strong">
        Start new sessions with your preferred model
      </h2>
      <p className="mt-2 mb-5 text-label leading-relaxed text-muted">
        Existing sessions keep their selected model. Choose a model in chat to override this default
        for that session.
      </p>
      {!choices.length ? (
        <EmptyState
          title="Choose your models first"
          description="Enable models in the Model Catalog before setting a default."
        />
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSave({
              modelId: modelId || null,
              effort: model ? validEffort(model, effort) : 'default',
            });
          }}
        >
          <fieldset className="grid gap-4 border-0 p-0" disabled={busy}>
            <Field>
              Default model
              <Select
                value={modelId}
                onChange={(event) => {
                  const next = state.models.find((model) => model.id === event.target.value);
                  setModelId(event.target.value);
                  setEffort(next ? next.options.effort : 'default');
                }}
              >
                <option value="">No default · choose in chat</option>
                {choices.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name} ·{' '}
                    {
                      state.connections.find((connection) => connection.id === item.connectionId)
                        ?.name
                    }
                  </option>
                ))}
              </Select>
            </Field>
            {model?.reasoning && model.reasoning.efforts.length > 0 && (
              <Field>
                Default reasoning effort
                <Select
                  value={validEffort(model, effort)}
                  onChange={(event) => setEffort(event.target.value as ReasoningEffort)}
                >
                  {availableEfforts(model).map((value) => (
                    <option value={value} key={value}>
                      {effortLabel(value)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </fieldset>
          <Button className="mt-5" variant="primary" type="submit" disabled={busy}>
            Save defaults
          </Button>
        </form>
      )}
      <p className="mt-6 border-t border-border-subtle pt-4 text-caption leading-relaxed text-subtle">
        Output limits, temperature, and supported reasoning budgets are configured in each model’s
        details. Higher reasoning effort may use more time and billed tokens.
      </p>
    </div>
  );
}
