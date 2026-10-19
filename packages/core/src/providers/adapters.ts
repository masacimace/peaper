import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { z } from 'zod';
import { effortValues, type ProviderConnection, type ModelOptions } from '@peaper/shared';
import type { ModelMetadata } from './store.js';

const rowSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().max(240).optional(),
  context_length: z.number().positive().nullish(),
  top_provider: z.object({ max_completion_tokens: z.number().positive().nullish() }).nullish(),
  pricing: z
    .object({
      prompt: z.union([z.string(), z.number()]).nullish(),
      completion: z.union([z.string(), z.number()]).nullish(),
    })
    .nullish(),
  supported_parameters: z.array(z.string()).optional(),
  reasoning: z
    .object({
      supported_efforts: z.array(z.string()).nullable().optional(),
      default_effort: z.string().nullish(),
      mandatory: z.boolean().optional(),
      supports_max_tokens: z.boolean().optional(),
    })
    .nullish(),
});
const responseSchema = z.object({ data: z.array(z.unknown()).max(5000) });
const safeFetch: typeof fetch = (input, init) => fetch(input, { ...init, redirect: 'error' });
function price(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed * 1_000_000 : null;
}
export function parseCatalog(raw: unknown): ModelMetadata[] {
  const response = responseSchema.parse(raw);
  const entries = new Map<string, ModelMetadata>();
  for (const value of response.data) {
    const parsed = rowSchema.safeParse(value);
    if (!parsed.success) continue;
    const row = parsed.data;
    if (row.top_provider?.max_completion_tokens && row.top_provider.max_completion_tokens < 256)
      continue;
    const reasoning = row.reasoning;
    const efforts =
      reasoning?.supported_efforts === null
        ? [...effortValues]
        : (reasoning?.supported_efforts ?? []).filter(
            (value): value is (typeof effortValues)[number] =>
              effortValues.includes(value as (typeof effortValues)[number]),
          );
    entries.set(row.id, {
      modelId: row.id,
      name: row.name || row.id,
      contextWindow: row.context_length ?? null,
      maxOutputTokens: row.top_provider?.max_completion_tokens ?? null,
      pricing: { input: price(row.pricing?.prompt), output: price(row.pricing?.completion) },
      supportedParameters: row.supported_parameters ?? [],
      toolCalling: row.supported_parameters ? row.supported_parameters.includes('tools') : null,
      reasoning: reasoning
        ? {
            efforts: efforts.filter((value) => !(reasoning.mandatory && value === 'none')),
            mandatory: reasoning.mandatory ?? false,
            supportsBudget: reasoning.supports_max_tokens ?? false,
            defaultEffort: effortValues.includes(
              reasoning.default_effort as (typeof effortValues)[number],
            )
              ? (reasoning.default_effort as (typeof effortValues)[number])
              : null,
          }
        : null,
    });
  }
  if (response.data.length && !entries.size) throw new Error('No valid models in catalog');
  return [...entries.values()];
}
async function listModels(connection: ProviderConnection, apiKey?: string) {
  const response = await safeFetch(`${connection.baseURL}/models`, {
    signal: AbortSignal.timeout(15000),
    headers: {
      Accept: 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw Object.assign(new Error('Catalog request failed'), { statusCode: response.status });
  }
  if (!response.body) throw new Error('Empty catalog');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 8 * 1024 * 1024) throw new Error('Catalog exceeds limit');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return parseCatalog(JSON.parse(Buffer.concat(chunks).toString('utf8')));
}

/** Provider differences stay behind one adapter contract, outside the UI and agent loop. */
export const providerAdapters = {
  openrouter: {
    listModels,
    model: (_connection: ProviderConnection, modelId: string, apiKey?: string) =>
      createOpenRouter({ apiKey: apiKey!, fetch: safeFetch })(modelId),
    options: (options: ModelOptions) =>
      options.reasoningBudget !== null
        ? { openrouter: { reasoning: { max_tokens: options.reasoningBudget } } }
        : options.effort === 'default'
          ? undefined
          : { openrouter: { reasoning: { effort: options.effort } } },
  },
  compatible: {
    listModels,
    model: (connection: ProviderConnection, modelId: string, apiKey?: string) =>
      createOpenAICompatible({
        name: 'peaper-compatible',
        baseURL: connection.baseURL,
        apiKey,
        fetch: safeFetch,
        includeUsage: true,
      })(modelId),
    options: (options: ModelOptions) =>
      options.reasoningBudget !== null
        ? { peaperCompatible: { reasoning: { max_tokens: options.reasoningBudget } } }
        : options.effort === 'default'
          ? undefined
          : { peaperCompatible: { reasoningEffort: options.effort } },
  },
} as const;
