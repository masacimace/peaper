import { useState, type FormEvent } from 'react';
import { FlaskConical } from 'lucide-react';
import {
  availableEfforts,
  effortLabel,
  type ManagedModel,
  type ModelOptions,
  type ModelState,
  type ProviderConnection,
  type ReasoningEffort,
} from '@peaper/shared';
import { Dialog } from '../../components/Dialog';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Field';
import { ErrorNotice } from '../../components/ui/Notice';
import { Badge } from '../../components/ui/Status';
import { api } from '../../lib/api';
import { tokenPrice } from './format';

export function ModelDetails({
  model,
  connection,
  onClose,
  onSaved,
}: {
  model: ManagedModel;
  connection?: ProviderConnection;
  onClose: () => void;
  onSaved: (state: ModelState) => void;
}) {
  const [options, setOptions] = useState<ModelOptions>(model.options);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dirty = JSON.stringify(options) !== JSON.stringify(model.options);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy('save');
    setError('');
    setNotice('');
    try {
      onSaved(await api.updateModel(model.id, { options }));
      setNotice('Model defaults saved. Applies to subsequent tasks.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save model.');
    } finally {
      setBusy('');
    }
  }
  async function test() {
    setBusy('test');
    setError('');
    setNotice('');
    try {
      onSaved(await api.testModel(model.id));
      setNotice('Streaming and tool calling verified for this model.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not test model.');
    } finally {
      setBusy('');
    }
  }
  return (
    <Dialog
      title="Model details"
      onClose={onClose}
      className="my-0 mr-0 h-dvh max-h-none w-100 max-w-[calc(100vw-20px)] overflow-y-auto rounded-none border-y-0"
    >
      <h3 className="text-small font-medium wrap-anywhere text-strong">{model.name}</h3>
      <p className="mt-1 font-mono text-micro wrap-anywhere text-subtle">{model.modelId}</p>
      <p className="mt-2 text-label text-muted">{connection?.name || 'Unavailable connection'}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Badge>{model.verifiedAt ? 'Tested · coding ready' : 'Model not tested'}</Badge>
        <Badge>{model.manual ? 'Manual ID' : 'Catalog model'}</Badge>
      </div>
      <dl className="my-5 space-y-2 text-caption">
        {[
          ['Input / 1M tokens', tokenPrice(model.pricing.input)],
          ['Output / 1M tokens', tokenPrice(model.pricing.output)],
          [
            'Context',
            model.contextWindow ? `${model.contextWindow.toLocaleString()} tokens` : 'Not provided',
          ],
          [
            'Output limit',
            model.maxOutputTokens
              ? `${model.maxOutputTokens.toLocaleString()} tokens`
              : 'Not provided',
          ],
          [
            'Tool calling',
            model.toolCalling === null
              ? 'Unknown · test required'
              : model.toolCalling
                ? 'Supported'
                : 'Not supported',
          ],
          [
            'Reasoning',
            model.reasoning
              ? model.reasoning.mandatory
                ? 'Required by model'
                : 'Supported'
              : 'No controls advertised',
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="flex justify-between gap-3 border-b border-border-subtle pb-2"
          >
            <dt className="text-muted">{label}</dt>
            <dd className="text-right">{value}</dd>
          </div>
        ))}
      </dl>
      <form onSubmit={(event) => void save(event)}>
        <h3 className="mb-3 text-label font-medium">Model defaults</h3>
        <fieldset disabled={Boolean(busy)} className="grid gap-4 border-0 p-0">
          {model.reasoning && model.reasoning.efforts.length > 0 && (
            <Field>
              Reasoning effort
              <Select
                value={options.effort}
                onChange={(event) =>
                  setOptions({
                    ...options,
                    effort: event.target.value as ReasoningEffort,
                    reasoningBudget: null,
                  })
                }
              >
                {availableEfforts(model).map((effort) => (
                  <option key={effort} value={effort}>
                    {effortLabel(effort)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field>
            Maximum output tokens
            <Input
              type="number"
              min={256}
              max={model.maxOutputTokens ?? 131072}
              required
              value={options.maxOutputTokens}
              onChange={(event) =>
                setOptions({ ...options, maxOutputTokens: Number(event.target.value) })
              }
            />
          </Field>
          {model.reasoning?.supportsBudget && (
            <Field>
              Reasoning token budget (optional)
              <Input
                type="number"
                min={1}
                max={options.maxOutputTokens - 1}
                value={options.reasoningBudget ?? ''}
                placeholder="Model default"
                disabled={options.effort !== 'default'}
                onChange={(event) =>
                  setOptions({
                    ...options,
                    reasoningBudget: event.target.value ? Number(event.target.value) : null,
                  })
                }
              />
            </Field>
          )}
          {(model.manual || model.supportedParameters.includes('temperature')) && (
            <Field>
              Temperature (optional)
              <Input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={options.temperature ?? ''}
                placeholder="Provider default"
                onChange={(event) =>
                  setOptions({
                    ...options,
                    temperature: event.target.value ? Number(event.target.value) : null,
                  })
                }
              />
            </Field>
          )}
        </fieldset>
        <p className="my-3 text-caption leading-relaxed text-subtle">
          Default effort follows the model’s behavior. Explicit effort replaces a saved reasoning
          budget for that task.
        </p>
        <Button type="submit" disabled={Boolean(busy) || !dirty}>
          Save model defaults
        </Button>
      </form>
      <div className="mt-6 border-t border-border pt-5">
        <h3 className="text-label font-medium">Capability test</h3>
        <p className="my-3 text-caption leading-relaxed text-muted">
          Makes a small model request to verify streaming and tool calling. This can use provider
          credits. Save changed settings before testing.
        </p>
        <Button
          disabled={
            Boolean(busy) ||
            dirty ||
            !connection?.enabled ||
            !model.available ||
            model.toolCalling === false
          }
          onClick={() => void test()}
        >
          <FlaskConical size={13} />
          {busy === 'test' ? 'Testing…' : 'Test model'}
        </Button>
        {model.verifiedAt && (
          <p className="mt-2 text-micro text-subtle">
            Last verified {new Date(model.verifiedAt).toLocaleString()}
          </p>
        )}
      </div>
      {(error || model.testError) && (
        <ErrorNotice className="mt-4">{error || model.testError}</ErrorNotice>
      )}
      {notice && (
        <p role="status" className="mt-3 text-caption leading-relaxed text-success">
          {notice}
        </p>
      )}
    </Dialog>
  );
}
