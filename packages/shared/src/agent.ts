import { z } from 'zod';
import { effortSchema, modelSelectionSchema } from './models.js';
import { agentModeSchema, instructionSchema } from './continuity.js';
import {
  contextSelectionSchema,
  knowledgeSnapshotSchema,
  memoryProposalSchema,
  memorySelectionSchema,
} from './knowledge.js';

export const providerInputSchema = z.object({
  kind: z.enum(['openrouter', 'compatible']),
  baseURL: z.string().trim().url().max(2048),
  model: z.string().trim().min(1).max(200),
  apiKey: z.string().max(4096).optional(),
  maxOutputTokens: z.number().int().min(256).max(16384).default(4096),
  temperature: z.number().min(0).max(2).nullable().default(null),
});
export type ProviderInput = z.infer<typeof providerInputSchema>;
export const providerStatusSchema = providerInputSchema.omit({ apiKey: true }).extend({
  hasKey: z.boolean(),
  verifiedAt: z.string().nullable(),
  streaming: z.boolean(),
  toolCalling: z.boolean(),
});
export type ProviderStatus = z.infer<typeof providerStatusSchema>;
export const providerResponseSchema = z.object({ provider: providerStatusSchema.nullable() });

export const changeSchema = z.object({
  id: z.string(),
  path: z.string(),
  before: z.string().nullable(),
  after: z.string(),
});
export type FileChange = z.infer<typeof changeSchema>;
export const activitySchema = z.object({
  id: z.string(),
  name: z.string(),
  input: z.record(z.string(), z.unknown()),
  status: z.enum(['running', 'waiting', 'completed', 'failed', 'cancelled']),
  output: z.string().optional(),
});
export type ToolActivity = z.infer<typeof activitySchema>;
export const permissionSchema = z.object({
  id: z.string(),
  activityId: z.string(),
  kind: z.enum(['write', 'command']),
  status: z.enum(['pending', 'approved', 'denied', 'cancelled']),
  description: z.string(),
  change: changeSchema.optional(),
  command: z.string().optional(),
});
export type ToolPermission = z.infer<typeof permissionSchema>;
export const questionSchema = z.object({
  id: z.string(),
  question: z.string(),
  options: z.array(z.string()),
  status: z.enum(['pending', 'answered', 'cancelled']),
  answer: z.string().nullable(),
});
export type AgentQuestion = z.infer<typeof questionSchema>;
export const todoSchema = z.object({
  text: z.string().min(1).max(200),
  status: z.enum(['pending', 'in_progress', 'completed']),
});
export const agentRunSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  prompt: z.string(),
  model: z.string(),
  connectionId: z.string().optional(),
  connectionName: z.string().optional(),
  effort: effortSchema.optional(),
  mode: agentModeSchema.default('build'),
  selectedFile: z.string().nullable().optional(),
  resumeOf: z.string().optional(),
  inheritedFrom: z.string().optional(),
  instructions: z.array(instructionSchema).default([]),
  knowledgeSelection: contextSelectionSchema.default({ profileId: 'default', skillIds: [] }),
  knowledge: knowledgeSnapshotSchema.default({
    persona: null,
    skills: [],
    memories: [],
    warnings: [],
  }),
  memorySuggestions: z.array(memoryProposalSchema).default([]),
  memorySelection: memorySelectionSchema.optional(),
  plan: z.string().optional(),
  context: z
    .object({
      estimatedTokens: z.number(),
      budget: z.number(),
      contextWindow: z.number().nullable(),
      compacted: z.boolean(),
    })
    .optional(),
  status: z.enum(['running', 'waiting', 'completed', 'failed', 'cancelled', 'interrupted']),
  text: z.string(),
  error: z.string().optional(),
  startedAt: z.string(),
  updatedAt: z.string(),
  activities: z.array(activitySchema),
  permissions: z.array(permissionSchema),
  questions: z.array(questionSchema).default([]),
  changes: z.array(changeSchema),
  todos: z.array(todoSchema),
  usage: z
    .object({ inputTokens: z.number().optional(), outputTokens: z.number().optional() })
    .optional(),
});
export type AgentRun = z.infer<typeof agentRunSchema>;
export const sendMessageSchema = z.object({
  message: z.string().trim().min(1).max(16000),
  selectedFile: z.string().max(2048).nullable().optional(),
  selection: modelSelectionSchema.optional(),
  mode: agentModeSchema.optional(),
  context: contextSelectionSchema.optional(),
  memory: memorySelectionSchema.optional(),
});
export const agentRunsSchema = z.object({ runs: z.array(agentRunSchema) });
