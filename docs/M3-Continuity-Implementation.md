# M3 Continuity — Implementation record

Date: 19 October 2026 (Asia/Jakarta). Preview version: `0.3.0-continuity.1`.

## Delivered behavior

M3 extends the existing single agent per session. Persistence, context management, scoped
instructions, planning, conversation forks and file checkpoints use backend contracts; the
frontend exposes them through a compact composer toolbar and session action menus. The
existing model/effort picker, panel layout, five themes and scrollbar behavior are retained.

| Capability         | Result                                                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session continuity | Draft/mode autosave, remembered selection, persisted run/tool messages, rename, title/conversation FTS search, JSON/Markdown export                                        |
| Reconnect/resume   | Reload reconnects to the same task; shutdown/restart marks unfinished runs interrupted; explicit resume creates one continuation with recovery context and fresh approvals |
| Context            | Approximate input use, advertised model window, output reserve, automatic/manual compaction and inspectable saved recap                                                    |
| Instructions       | Global/project/directory `PEAPER.md`, visible source text, pre-tool scope loading and an immutable instruction snapshot on each run                                        |
| Plan               | Backend-enforced read/search mode, structured questions/todos, persisted reviewable plan, revision conflict checks and an explicit transition to Build                     |
| Fork               | A conversation prefix copied into a separate session, copied model selection and recap boundary, independent future turns/drafts, shared files                             |
| Rewind/restore     | Preview of removed turns and file diffs, selected-file restore, separate conversation rewind, external-change conflicts and archived transcript exports                    |

## Modules

| Location                                       | Responsibility                                                                                                         |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/continuity.ts`            | Mode, instruction, context, draft/plan/recap and rewind preview contracts                                              |
| `packages/core/src/continuity/instructions.ts` | Bounded UTF-8 instruction loading and workspace/symlink scope checks                                                   |
| `packages/core/src/continuity/service.ts`      | Context history/budgets, compaction, drafts, forks, checkpoints, rewind and exports                                    |
| `packages/core/src/agent/runtime.ts`           | Captured mode, Plan enforcement, resumable recovery context, instruction injection, preflight and per-step persistence |
| `packages/core/src/agent/store.ts`             | Scoped runs, durable tool messages, interruption recovery and file checkpoint ledger                                   |
| `packages/core/migrations/0004_continuity.sql` | Additive migration, visibility, continuity state, checkpoint backfill, transcript search and idempotent resume index   |
| `apps/server/src/continuity.ts`                | Authenticated, workspace-scoped continuity routes and operation locks                                                  |
| `apps/web/src/features/continuity/`            | Draft autosave, context, review plan, history, session actions and downloads                                           |
| `tests/continuity.test.ts`                     | Persistence, actual adapter/tool loop, safety boundaries, upgrade and recovery tests                                   |
| `tests/fixtures/m3-preview.ts`                 | Isolated browser QA using a local deterministic provider and real workspace edits                                      |

Run state and model messages are persisted at completed model steps, including tool-call/result
pairs. Partial text, activities, decisions and applied changes remain inspectable after a failure.
Resume is an explicit new generation; it includes prior outcomes and denials, requests fresh
permissions, and does not programmatically retry any tool. Repeated resume requests return the
same continuation. If that continuation was rewound, the API asks for a new message or fork.

## Context and instruction rules

Input estimation uses UTF-8 bytes divided by three, with model output tokens and 4,000 tokens
reserved from the context window for overhead. Unknown windows use a conservative 32,768-token
fallback. Usage is approximate; provider-reported usage is retained separately on each run.

Before a new turn, input above 80% of the budget triggers compaction of completed history.
Manual compaction retains the two most recent turns. The recap preserves user intent, actual
outcomes, denials and outstanding work. It does not replace or delete the original transcript.
Summarization uses the selected provider/model/effort and may consume credits. Summaries are
bounded, batched and persisted only after the entire operation succeeds. Compaction has a
60-second overall limit and at most 16 batches; shutdown aborts and waits before closing SQLite.
An oversized individual turn or insufficient context produces an actionable error, retaining
history. Within an active task, preflight stops before another request exceeds the budget;
M3 does not summarize unfinished tool-call/result pairs in place.

Instruction precedence is global → project → directory, within the relevant path. Sources
are `~/.peaper/PEAPER.md`, workspace-root `PEAPER.md` and ancestor directories of the selected
file or path tool. Each file is a regular UTF-8 file, at most 32 KB; combined active sources
are capped at 96 KB. Protected runtime paths, traversal and symlinks/junctions are rejected.
When a tool enters or leaves a directory scope, its first attempt returns the applicable
instructions without executing the action. The next model step can review and retry it.
Directory rules do not remain active for unrelated paths; the task retains all used sources
for audit. These files do not override the human request or backend permission policy.

Plan excludes writing and command tools from the advertised set and checks again in their
backend execution path. Plans carry revision numbers. A stale review cannot start a new
implementation; repeated implementation clicks return the original Build run. Plan mode never
grants permission to write indirectly through a command.

## Snapshot and fork boundaries

Before an approved file-tool write, the ledger stores a pending checkpoint; successful writes
record applied state and full before/after text. Pending checkpoints after interruption are
uncertain and require manual inspection. Existing M2 applied changes are backfilled by the
additive migration. Commands and interactive terminal edits do not create file checkpoints.

Rewind preview calculates the selected conversation suffix and chains its Peaper edits per
path. Current contents must match the last applied result, and every intermediate edit must
connect to the previous checkpoint. A manual edit, a pending checkpoint, protected file or
stale preview blocks the affected restore. Restore rechecks exact contents at apply time.
New files may be removed only when their current contents match the Peaper-created contents.
No recursive deletion is used.

Restore and rewind have distinct API routes and buttons. Restore changes only selected files,
records the paths/time and adds a restore notice to subsequent model context. A partial file
failure reports its count and leaves conversation history intact. Restore is per file, not a
cross-file filesystem transaction. All active workspace tasks must stop before restore/rewind.
Conversation rewind archives later turns, removes them from active context and search, keeps
them in exports, preserves drafts, and restores the retained plan for another review. Restoring
files must precede archiving their turns. No command, database, network or remote-service
effects are reversed.

Fork copies persisted history through a chosen turn, assigns new run IDs, marks inherited
turns and copies the model selection/valid recap. It does not execute tools, duplicate a working
directory or copy file checkpoints. Both branches use the same live workspace. Inherited runs
cannot be resumed as original work. This is conversation branching, with one primary agent
per session; parallel subagents, Git branches/worktrees and sandbox isolation remain later work.

## Validation

Automated tests exercise authenticated routes, SQLite restart/FTS/export, M2-to-M3 migration,
backend Plan restrictions despite invalid provider calls, reviewed implementation with fresh
write approval, instruction precedence and scope exit, interrupted tool-message recovery,
idempotent resume, manual/automatic compaction through the compatible adapter, fork isolation,
external and between-edit conflicts, new-file removal, uncertain writes, stale previews,
separate restore/rewind, draft/plan preservation and compaction shutdown/error behavior.

Browser QA uses the isolated M3 fixture: draft/mode reload, compaction/source inspection,
Plan review/revision, Build approval surviving reload, file restore and conversation rewind,
fork/rename/export and responsive layouts. No paid provider generation is required for this
validation. M2's live OpenRouter result remains recorded in its own implementation document;
M3 continuity is validated with deterministic local provider responses and actual file writes.

Skills, Memory and Persona are delivered in [M4 Knowledge](M4-Knowledge-Implementation.md). MCP/hooks, Git/worktrees and background task management
remain M5. npm publication and broader native/platform validation remain M6.
