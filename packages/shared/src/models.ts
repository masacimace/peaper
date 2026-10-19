import { z } from 'zod';

export const effortValues = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export const effortSchema = z.enum(['default', ...effortValues]);
export type ReasoningEffort = z.infer<typeof effortSchema>;
export const connectionInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(['openrouter', 'compatible']),
  baseURL: z.string().trim().url().max(2048),
  apiKey: z.string().max(4096).optional(),
  enabled: z.boolean().default(true),
});
export type ConnectionInput = z.infer<typeof connectionInputSchema>;
export const connectionSchema = connectionInputSchema.omit({ apiKey: true }).extend({
  id: z.string().uuid(),
  hasKey: z.boolean(),
  checkedAt: z.string().nullable(),
  catalogUpdatedAt: z.string().nullable(),
  error: z.string().nullable(),
});
export type ProviderConnection = z.infer<typeof connectionSchema>;

export const modelOptionsSchema = z.object({
  effort: effortSchema.default('default'),
  reasoningBudget: z.number().int().min(1).max(131071).nullable().default(null),
  maxOutputTokens: z.number().int().min(256).max(131072).default(4096),
  temperature: z.number().min(0).max(2).nullable().default(null),
});
export type ModelOptions = z.infer<typeof modelOptionsSchema>;
export const modelSchema = z.object({
  id: z.string().uuid(),
  connectionId: z.string().uuid(),
  modelId: z.string().trim().min(1).max(200),
  name: z.string().max(240),
  contextWindow: z.number().positive().nullable(),
  maxOutputTokens: z.number().positive().nullable(),
  pricing: z.object({
    input: z.number().nonnegative().nullable(),
    output: z.number().nonnegative().nullable(),
  }),
  supportedParameters: z.array(z.string()),
  toolCalling: z.boolean().nullable(),
  reasoning: z
    .object({
      efforts: z.array(z.enum(effortValues)),
      mandatory: z.boolean(),
      supportsBudget: z.boolean(),
      defaultEffort: z.enum(effortValues).nullable(),
    })
    .nullable(),
  manual: z.boolean(),
  available: z.boolean(),
  favorite: z.boolean(),
  showInChat: z.boolean(),
  options: modelOptionsSchema,
  verifiedAt: z.string().nullable(),
  testError: z.string().nullable(),
});
export type ManagedModel = z.infer<typeof modelSchema>;
export const modelSelectionSchema = z.object({
  modelId: z.string().uuid(),
  effort: effortSchema.default('default'),
});
export type ModelSelection = z.infer<typeof modelSelectionSchema>;
export const modelDefaultsSchema = z.object({
  modelId: z.string().uuid().nullable(),
  effort: effortSchema.default('default'),
});
export const modelStateSchema = z.object({
  connections: z.array(connectionSchema),
  models: z.array(modelSchema),
  defaults: modelDefaultsSchema,
});
export type ModelState = z.infer<typeof modelStateSchema>;
export const modelPreferenceSchema = z.object({
  favorite: z.boolean().optional(),
  showInChat: z.boolean().optional(),
  options: modelOptionsSchema.optional(),
});
export const manualModelSchema = z.object({
  connectionId: z.string().uuid(),
  modelId: z.string().trim().min(1).max(200),
  name: z.string().trim().max(240).optional(),
});
export const selectionResponseSchema = z.object({ selection: modelSelectionSchema.nullable() });

export function availableEfforts(model: Pick<ManagedModel, 'reasoning'>): ReasoningEffort[] {
  return [
    'default',
    ...(model.reasoning?.efforts.filter(
      (value) => !(value === 'none' && model.reasoning?.mandatory),
    ) ?? []),
  ];
}
export function validEffort(
  model: Pick<ManagedModel, 'reasoning'>,
  value: ReasoningEffort,
): ReasoningEffort {
  return availableEfforts(model).includes(value) ? value : 'default';
}
export function effortLabel(value: ReasoningEffort) {
  return {
    default: 'Default',
    none: 'Off',
    minimal: 'Minimal',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    xhigh: 'Extra high',
    max: 'Max',
  }[value];
}
