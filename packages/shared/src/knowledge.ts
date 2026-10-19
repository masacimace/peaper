import { z } from 'zod';

export const skillScopeSchema = z.enum(['builtin', 'personal', 'project']);
export const skillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  scope: skillScopeSchema,
  path: z.string(),
  compatibility: z.string(),
  enabled: z.boolean(),
  automatic: z.boolean(),
});
export type Skill = z.infer<typeof skillSchema>;
export const skillDetailSchema = skillSchema.extend({
  document: z.string(),
  instructions: z.string(),
  digest: z.string(),
  resources: z.array(z.object({ path: z.string(), bytes: z.number() })),
});
export type SkillDetail = z.infer<typeof skillDetailSchema>;
export const skillInspectionSchema = z.object({
  skill: skillDetailSchema,
  references: z.array(
    z.object({
      path: z.string(),
      status: z.enum(['found', 'missing', 'outside']),
    }),
  ),
  referencesTruncated: z.boolean(),
  runtimes: z.array(
    z.object({
      name: z.string(),
      status: z.enum(['available', 'unavailable', 'unsupported']),
      files: z.array(z.string()),
    }),
  ),
  inspectedAt: z.string(),
});
export type SkillInspection = z.infer<typeof skillInspectionSchema>;
export const usedSkillSchema = skillSchema.extend({
  instructions: z.string(),
  digest: z.string(),
  invocation: z.enum(['manual', 'automatic']),
  activationReason: z.string().max(500).optional(),
});
export type UsedSkill = z.infer<typeof usedSkillSchema>;
export const skillCatalogSchema = z.object({
  skills: z.array(skillSchema),
  errors: z.array(z.string()),
  roots: z.object({ personal: z.string(), project: z.string() }),
});
export type SkillCatalog = z.infer<typeof skillCatalogSchema>;

export const personaInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).default(''),
  instructions: z.string().trim().min(1).max(8000),
  scope: z.enum(['personal', 'project']),
  enabled: z.boolean().default(true),
});
export const personaSchema = personaInputSchema.extend({
  id: z.string(),
  revision: z.number().int(),
  updatedAt: z.string(),
});
export type Persona = z.infer<typeof personaSchema>;
export const contextSelectionSchema = z.object({
  profileId: z.string().max(100).default('default'),
  skillIds: z.array(z.string().max(100)).max(3).default([]),
});
export type ContextSelection = z.infer<typeof contextSelectionSchema>;
export const memoryScopeSchema = z.enum(['global', 'project', 'recap']);
export const memorySelectionSchema = z.object({
  includeIds: z.array(z.string().max(100)).max(6).default([]),
  excludeIds: z.array(z.string().max(100)).max(100).default([]),
});
export type MemorySelection = z.infer<typeof memorySelectionSchema>;
export const memoryEvidenceInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('file'), path: z.string().min(1).max(2048) }),
  z.object({
    kind: z.literal('message'),
    runId: z.string().max(100),
    role: z.enum(['user', 'assistant']),
  }),
  z.object({
    kind: z.literal('activity'),
    runId: z.string().max(100),
    activityId: z.string().max(200),
  }),
]);
export type MemoryEvidenceInput = z.infer<typeof memoryEvidenceInputSchema>;
export const memoryEvidenceSchema = z.object({
  reference: memoryEvidenceInputSchema,
  workspaceId: z.string(),
  label: z.string(),
  digest: z.string(),
  excerpt: z.string().max(2000),
  capturedAt: z.string(),
  outcome: z.string().optional(),
});
export type MemoryEvidence = z.infer<typeof memoryEvidenceSchema>;
export const memoryInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(8000),
  scope: memoryScopeSchema,
  sessionId: z.string().nullable().default(null),
  sourceRunId: z.string().nullable().default(null),
  pinned: z.boolean().default(false),
  evidence: z.array(memoryEvidenceInputSchema).max(8).optional(),
});
export type MemoryInput = z.infer<typeof memoryInputSchema>;
export const memorySchema = memoryInputSchema.extend({
  evidence: z.array(memoryEvidenceSchema).default([]),
  id: z.string(),
  revision: z.number().int(),
  updatedAt: z.string(),
  createdAt: z.string(),
});
export type MemoryNote = z.infer<typeof memorySchema>;
export const memoryProposalSchema = memoryInputSchema.extend({
  evidence: z.array(memoryEvidenceSchema).default([]),
  id: z.string(),
  status: z.enum(['pending', 'saved', 'dismissed']),
  memoryId: z.string().nullable(),
  decision: z.enum(['create', 'update']).optional(),
});
export type MemoryProposal = z.infer<typeof memoryProposalSchema>;
export const memoryContextSchema = z.object({
  id: z.string(),
  revision: z.number().int(),
  title: z.string(),
  scope: memoryScopeSchema,
  selected: z.boolean(),
  reason: z.enum(['manual', 'pinned', 'match', 'excluded', 'unmatched', 'budget', 'search']),
  stage: z.enum(['initial', 'search']),
  matchedTerms: z.array(z.string()).default([]),
});
export type MemoryContext = z.infer<typeof memoryContextSchema>;
export const memoryLensSchema = z.object({
  entries: z.array(z.object({ memory: memorySchema, context: memoryContextSchema })),
  memories: z.array(memorySchema),
  warnings: z.array(z.string()),
  overBudget: z.boolean(),
});
export type MemoryLens = z.infer<typeof memoryLensSchema>;
export const memoryRevisionSchema = z.object({
  memory: memorySchema,
  action: z.enum(['imported', 'created', 'updated']),
  recordedAt: z.string(),
});
export const memoryReviewSchema = z.object({
  inputDigest: z.string(),
  evidenceDigest: z.string(),
  evidence: z.array(memoryEvidenceSchema),
  candidates: z.array(
    z.object({ memory: memorySchema, reason: z.string(), sharedTerms: z.array(z.string()) }),
  ),
  previous: memorySchema.nullable(),
  notices: z.array(z.string()),
});
export type MemoryReview = z.infer<typeof memoryReviewSchema>;
export const memoryEvidenceViewSchema = z.object({
  memory: memorySchema,
  revisions: z.array(memoryRevisionSchema),
  uses: z.array(
    z.object({
      runId: z.string(),
      sessionId: z.string(),
      title: z.string(),
      revision: z.number(),
      startedAt: z.string(),
      reason: z.string(),
      stage: z.string(),
    }),
  ),
  sources: z.array(
    z.object({
      runId: z.string(),
      sessionId: z.string(),
      title: z.string(),
      prompt: z.string(),
      text: z.string(),
    }),
  ),
});
export type MemoryEvidenceView = z.infer<typeof memoryEvidenceViewSchema>;
export const knowledgeSnapshotSchema = z.object({
  persona: personaSchema.nullable().default(null),
  skills: z.array(usedSkillSchema).default([]),
  memories: z.array(memorySchema).default([]),
  warnings: z.array(z.string()).default([]),
  memoryContext: z.array(memoryContextSchema).optional(),
});
export type KnowledgeSnapshot = z.infer<typeof knowledgeSnapshotSchema>;
export const knowledgeStateSchema = z.object({
  personas: z.array(personaSchema),
  defaultProfileId: z.string(),
  selection: contextSelectionSchema,
  catalog: skillCatalogSchema,
});
export type KnowledgeState = z.infer<typeof knowledgeStateSchema>;
