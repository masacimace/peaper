import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import { modelSchema, type ModelState } from '@peaper/shared';
import { ModelPicker } from '../src/features/models/ModelPicker.js';

test('composer effort displays values only, excludes Off for mandatory models and hides unsupported controls', () => {
  const connectionId = randomUUID(),
    id = randomUUID();
  const model = modelSchema.parse({
    id,
    connectionId,
    modelId: 'coding',
    name: 'Coding',
    contextWindow: null,
    maxOutputTokens: null,
    pricing: { input: null, output: null },
    supportedParameters: ['tools'],
    toolCalling: true,
    reasoning: {
      efforts: ['none', 'high', 'low'],
      mandatory: true,
      supportsBudget: false,
      defaultEffort: null,
    },
    manual: false,
    available: true,
    favorite: false,
    showInChat: true,
    options: {},
    verifiedAt: null,
    testError: null,
  });
  const state: ModelState = {
    connections: [
      {
        id: connectionId,
        name: 'Local',
        kind: 'compatible',
        baseURL: 'http://localhost:1234/v1',
        enabled: true,
        hasKey: false,
        checkedAt: null,
        catalogUpdatedAt: null,
        error: null,
      },
    ],
    models: [model],
    defaults: { modelId: id, effort: 'high' },
  };
  const render = () =>
    renderToStaticMarkup(
      <ModelPicker
        state={state}
        selection={{ modelId: id, effort: 'high' }}
        workspaceId="test"
        onSelect={async () => {}}
        onManage={() => {}}
      />,
    );
  const html = render();
  assert.match(html, /aria-label="Reasoning effort"/);
  const text = html.replace(/<[^>]*>/g, '');
  assert.equal(text.includes('Reasoning'), false);
  assert.equal(text.includes('Off'), false);
  assert.match(html, /value="high" selected=""/);
  state.models[0] = { ...model, reasoning: null };
  assert.equal(render().includes('<select'), false);
});
