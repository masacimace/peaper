# M2 Coding — Implementation record

Date: 19 October 2026 (Asia/Jakarta). Preview version: `0.2.0-coding.1`.

## Delivered

M2 connects the modular Peaper workspace to a single coding agent per session. OpenRouter
and custom OpenAI-compatible Chat Completions endpoints are supported through AI SDK 7.
No subagents, ACP, publishing, or cloud deployment are introduced.

- Models manages named provider connections, cached catalogs, favorites/chat visibility and
  defaults. Model details configure supported parameters and test streaming/tool calling.
  Explicit model tests generate a small request; connection checks only retrieve the catalog.
  See [model management](Models-Management.md) for persistence and adapter contracts.
- The backend owns generation, tools, permissions and cancellation. Refreshing or closing
  the browser does not re-run a completed tool or abandon the agent command lifecycle.
- Tools list directories, read bounded UTF-8 line ranges, search text/regex/filenames,
  create/replace files, make exact text edits, execute commands, maintain todos, and ask
  structured questions. Every write and command requires a one-time backend approval.
- Agent displays streamed Markdown, tool input/output, actual command exit codes,
  approval/denial, proposed/applied diffs, errors, usage when supplied, and cancellation.
  Tasks displays run status and todo progress. Selected-file context accompanies a message.
- An initial message can create/select its session. Follow-ups use completed model/tool
  messages from recent runs. The database stores prompts, output, tools, questions,
  decisions, changes and todos. Unfinished work becomes interrupted after restart.
- The file browser and read-only editor refresh after applied agent changes. Navigation,
  panel layout, terminal and Preview behavior, and all five color schemes are retained.

## Modules and contracts

| Location                                            | Responsibility                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `packages/shared/src/agent.ts`                      | Provider, run, permission, diff, todo and question schemas                                 |
| `packages/core/src/providers/`                      | Local credential storage, model adapters, capability check and redacted errors             |
| `packages/core/src/agent/`                          | Agent loop, persisted run state, approvals/questions, command lifecycle and bounded search |
| `packages/core/src/workspace/edits.ts`              | Proposed changes and conflict-checked writes                                               |
| `packages/core/migrations/0002_agent.sql`           | Run/model-message persistence, preserving M1 data                                          |
| `apps/server/src/agent.ts`                          | Authenticated provider, message, run, cancel, answer and approval routes                   |
| `apps/web/src/features/agent/`                      | Composer, transcript, activity, diff/approval/question UI and result formatting            |
| `apps/web/src/features/models/`                     | Providers, catalog, model details/defaults and per-session chat selection                  |
| `packages/shared/src/models.ts`                     | Connection, catalog, model options and selection contracts                                 |
| `packages/core/migrations/0003_model_selection.sql` | Persistent session model and effort selections                                             |
| `apps/server/src/models.ts`                         | Authenticated multi-connection, catalog and selection routes                               |
| `apps/web/src/components/ui/`                       | Shared Tailwind controls; feature utilities use the semantic theme tokens                  |

SSE notifications reference persisted run IDs; clients reread state instead of executing
tools. Run access is scoped to the active workspace. Existing HTTP-origin/token checks,
ordered SSE replay, terminal WebSocket authentication and PTY workers remain in force.

## Permissions, credentials and limits

Reads/searches exclude generated/private paths and Peaper runtime data, including canonical
Windows short-path aliases. New edits reject traversal, protected paths, symlinks/junctions
and conflicting contents. Approval authorizes the reviewed proposal; a changed file requires
a new read/proposal. Existing files use a temporary file and rename; new files use exclusive
creation. These checks are not a filesystem sandbox against another process owned by the user.

The interactive terminal and approved agent commands run with host-account permissions.
Commands can have filesystem/network effects beyond the file tools. A user must inspect the
command before allowing it. Stop/cancel cannot undo completed effects or applied changes.

Provider credentials are encrypted with AES-256-GCM in the data directory. A separate local
master-key file and owner-only POSIX creation modes protect normal storage access; Windows
uses inherited local filesystem ACLs. This is not isolation from the user's own account or
a guarantee against local malware. Runtime data is excluded from file tools and npm contents.
The frontend receives only public configuration and `hasKey`/capability status. Neither SDK
errors nor HTTP errors echo provider response bodies, request details or credential values.
Changing an endpoint does not transfer a stored key to that destination.

| Resource                   | Bound                                                                    |
| -------------------------- | ------------------------------------------------------------------------ |
| Concurrent active sessions | 4; one task per session                                                  |
| Model steps / tool calls   | 20 / 80                                                                  |
| Overall task time          | 20 minutes                                                               |
| Pending approval/question  | 10 minutes                                                               |
| Agent command              | 60 seconds, noninteractive, 32,000 output characters                     |
| File preview/read          | 512 KB UTF-8, at most 400 lines / 28,000 tool-output characters per read |
| File edit                  | 128 KB UTF-8                                                             |
| Search                     | 500 entries, 4 MB candidate text, 60 matches                             |
| Regex execution            | Separate worker, 1.5-second timeout and memory bound                     |

## Validation

- Production build, TypeScript, ESLint and formatting checks. Path mappings use explicit
  relative paths without the deprecated `baseUrl` option.
- Tests cover the foundation and M2: both adapters, encrypted/redacted credentials,
  capability rejection, a complete real-file/command loop against a deterministic model
  fixture, approvals and denial, cross-workspace isolation, short Windows paths, conflicting
  edits, command-tree cancellation/timeouts, safe Markdown, accurate exit status, questions,
  interruption/replay behavior, regex bounds, HMR, terminal, storage and all five palettes.
- Installed-package validation packs and installs the tarball outside the repository and
  runs the real executable, native diagnostics, assets, migrations, sessions and restart checks.
- Browser validation exercises Models save/catalog/test, sending through the composer, per-action
  approvals, proposed diffs, applied changes, command results, editor refresh and Tasks.
  Completed live output survives reload; forms/editor/Markdown work in all five themes.
  At 390 px the provider form uses one column and Agent remains usable through focused panels.

### Live OpenRouter coding check

With the user's selected `deepseek/deepseek-v4.1-flash-1017` model, a separate temporary
workspace contained a broken addition function and three assertions. The model read both
files, ran the test (actual exit 1), proposed a one-line fix, waited for write approval,
then reran the unchanged test after command approval. It printed
`ADDITION_LIVE_OK: all 3 assertions passed` with actual exit 0. Only `math.mjs` changed.
Provider-reported usage for this run was 10,433 input tokens and 536 output tokens.

Both the dedicated OpenRouter adapter and the generic compatible adapter also passed live
streaming/tool capability checks against this chosen OpenRouter endpoint. This does not
claim validation of every third-party compatible endpoint or model.

Local evidence (ignored artifacts, containing no API key):

- `artifacts/m2-live-validation.json`
- `artifacts/m2-compatible-live-validation.json`
- `artifacts/m2-approval-diff.png`
- `artifacts/m2-openrouter-live-result.png`
- `artifacts/peaper-local-0.2.0-coding.1.tgz`

The live check reused the configured backend credential store without copying credentials
to the fixture, printing them, or sending them to a different provider. Model/tool simulation
is confined to explicitly named test fixtures; normal Peaper responses use the configured model.

## Boundary for M3

Advanced context budgeting/compaction, instruction loading, plan mode, conversation fork,
snapshots/rewind and recovery are delivered in [M3 Continuity](M3-Continuity-Implementation.md).
Skills/Memory managers remain M4; MCP/hooks,
Git/worktrees and persistent background command management remain M5. npm publication and
broader native/platform release validation remain M6.

## Implementation references

- [AI SDK tools and tool calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- [AI SDK compatible provider](https://ai-sdk.dev/providers/openai-compatible-providers)
- [OpenRouter AI SDK provider](https://github.com/OpenRouterTeam/ai-sdk-provider)
- [React Markdown](https://github.com/remarkjs/react-markdown)
