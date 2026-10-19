import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText, tool, isStepCount, APICallError, type LanguageModel } from 'ai';
import type { ProviderStatus, ModelSelection } from '@peaper/shared';
import { z } from 'zod';
import type { ProviderStore } from './store.js';
import { providerAdapters } from './adapters.js';

export function configuredSelection(store: ProviderStore, selection?: ModelSelection | null) {
  const resolved = store.resolve(selection);
  const adapter = providerAdapters[resolved.connection.kind];
  const providerOptions: Parameters<typeof streamText>[0]['providerOptions'] = adapter.options(
    resolved.options,
  );
  return {
    ...resolved,
    languageModel: adapter.model(resolved.connection, resolved.model.modelId, resolved.apiKey),
    providerOptions,
  };
}
export async function testManagedModel(store: ProviderStore, id: string) {
  const found = store.snapshot().models.find((model) => model.id === id);
  if (!found) throw Object.assign(new Error('Model not found.'), { statusCode: 404 });
  const configured = configuredSelection(store, { modelId: id, effort: found.options.effort });
  try {
    await probeModel(configured.languageModel, {
      maxOutputTokens: configured.options.maxOutputTokens,
      providerOptions: configured.providerOptions,
    });
    store.modelTested(id, configured.revision, null);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Model test failed.';
    store.modelTested(id, configured.revision, message);
    throw error;
  }
  return store.snapshot();
}

export function configuredModel(store: ProviderStore) {
  const { settings, apiKey, revision } = store.credentials();
  return { settings, model: providerModel(settings, apiKey), revision };
}
export function providerModel(settings: ProviderStatus, apiKey?: string) {
  const safeFetch: typeof fetch = (input, init) => fetch(input, { ...init, redirect: 'error' });
  return settings.kind === 'openrouter'
    ? createOpenRouter({ apiKey: apiKey!, fetch: safeFetch })(settings.model)
    : createOpenAICompatible({
        name: 'peaper-compatible',
        baseURL: settings.baseURL,
        apiKey,
        fetch: safeFetch,
        includeUsage: true,
      })(settings.model);
}
export function modelError(error: unknown): string {
  // Provider errors may contain request headers, URLs, or echoed prompts. Never return raw bodies.
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 401 || error.statusCode === 403)
      return 'Provider authentication failed. Check the API key and model access on the Models page.';
    if (error.statusCode === 429)
      return 'Provider rate or credit limit reached. Check the provider account and try again.';
    return `Provider request failed${error.statusCode ? ` (${error.statusCode})` : ''}. Check endpoint, model, network, and streaming/tool support.`;
  }
  return 'The model request did not complete. Check endpoint, network, and streaming/tool support on the Models page.';
}
export async function testProvider(store: ProviderStore) {
  store.invalidate();
  const { settings, model, revision } = configuredModel(store);
  await probeModel(model);
  return store.verified(settings, revision);
}
export async function probeModel(
  model: LanguageModel,
  settings: {
    maxOutputTokens?: number;
    providerOptions?: Parameters<typeof streamText>[0]['providerOptions'];
  } = {},
) {
  let called = false;
  let streamed = false;
  const result = streamText({
    onError: () => {},
    model,
    prompt:
      'Call peaper_connection_check with ok=true. This is a connection check; no workspace data is included.',
    maxOutputTokens: settings.maxOutputTokens ?? 256,
    providerOptions: settings.providerOptions,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(30000),
    stopWhen: isStepCount(1),
    toolChoice: { type: 'tool', toolName: 'peaper_connection_check' },
    tools: {
      peaper_connection_check: tool({
        description: 'Confirm that tool calling works.',
        inputSchema: z.object({ ok: z.literal(true) }),
        execute: async () => {
          called = true;
          return { ok: true };
        },
      }),
    },
  });
  try {
    for await (const part of result.fullStream) {
      if (
        part.type === 'tool-input-start' ||
        part.type === 'tool-call' ||
        part.type === 'text-delta'
      )
        streamed = true;
      if (part.type === 'error') throw part.error;
    }
    if (!called || !streamed) throw new Error('Unsupported capabilities');
  } catch (error) {
    throw Object.assign(new Error(modelError(error)), { statusCode: 422 });
  }
}
