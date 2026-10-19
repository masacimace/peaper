import { z } from 'zod';
import { knowledgeSnapshotSchema } from './knowledge.js';

export const agentModeSchema = z.enum(['build', 'plan']);
export type AgentMode = z.infer<typeof agentModeSchema>;
export const instructionSchema = z.object({
  path: z.string(),
  scope: z.enum(['global', 'project', 'directory']),
  content: z.string(),
  digest: z.string(),
});
export type ActiveInstruction = z.infer<typeof instructionSchema>;
export const continuityStateSchema = z.object({
  draft: z.string().default(''),
  draftUpdatedAt: z.string().nullable().default(null),
  mode: agentModeSchema.default('build'),
  lastRestore: z
    .object({ paths: z.array(z.string()), createdAt: z.string() })
    .nullable()
    .default(null),
  plan: z
    .object({
      text: z.string(),
      runId: z.string(),
      revision: z.number().int(),
      implementedBy: z.string().nullable(),
    })
    .nullable()
    .default(null),
  compaction: z
    .object({ summary: z.string(), throughRunId: z.string(), createdAt: z.string() })
    .nullable()
    .default(null),
  parent: z
    .object({ sessionId: z.string(), runId: z.string().nullable() })
    .nullable()
    .default(null),
});
export type ContinuityState = z.infer<typeof continuityStateSchema>;
export const contextInfoSchema = z.object({
  state: continuityStateSchema,
  estimatedTokens: z.number(),
  contextWindow: z.number().nullable(),
  outputReserve: z.number(),
  budget: z.number(),
  compactedTurns: z.number(),
  totalTurns: z.number(),
  instructions: z.array(instructionSchema),
  knowledge: knowledgeSnapshotSchema.optional(),
});
export type ContextInfo = z.infer<typeof contextInfoSchema>;
export const restoreFileSchema = z.object({
  path: z.string(),
  before: z.string().nullable(),
  after: z.string().nullable(),
  conflict: z.string().nullable(),
});
export const rewindPreviewSchema = z.object({
  afterRunId: z.string().nullable(),
  revision: z.string(),
  turnCount: z.number(),
  files: z.array(restoreFileSchema),
  warnings: z.array(z.string()),
});
export type RewindPreview = z.infer<typeof rewindPreviewSchema>;
