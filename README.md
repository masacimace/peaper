# Peaper

A local coding workspace, launched from your project and opened in your browser.

This is the **M4 Skills and Memory** preview, built on the modular coding workspace. Configure an
OpenRouter or OpenAI-compatible model in Models, test streaming/tool support, and send a task
from the Agent panel. File edits and commands require approval before execution.

## Requirements

- Node.js **24.x**, pnpm **12.14.0**, and npm.
- Initial validation target: Windows 10 x64. Native dependencies are installed for the local
  Node ABI and architecture; binaries are not bundled into the application tarball.
- `node-pty` uses ConPTY on Windows. If a native prebuild is unavailable, installation can
  require the platform's C++ toolchain. Run `peaper doctor` to verify your environment.

## Run from source

```powershell
pnpm install
pnpm build
pnpm start
```

Peaper binds to `127.0.0.1:4317` and opens the browser. The URL printed by the launcher includes
a local access token in its fragment. The browser stores it for that tab and removes it from
the address bar. Use the complete launcher URL when opening another tab.

```powershell
pnpm start --no-open --port 4318
pnpm start --workspace D:\Projects\my-project --data-dir D:\PeaperData
pnpm doctor
```

`--port 0` chooses a free port. An occupied explicit port fails with a clear error rather than
silently moving to another address. `--help` and `--version` work without starting the server.

For development, run `pnpm dev` (or `pnpm dev --no-open`). Vite serves React/CSS directly with
HMR and React Fast Refresh: save a source file and the open UI updates without a manual build
or browser refresh. UI, API, SSE, terminal, and HMR share the launcher's local URL and port.
Backend changes automatically rebuild and restart the runtime. The access token stays valid
across those restarts within the same development run; a new `pnpm dev` run creates a new token.
Some changes outside React refresh boundaries or to Vite configuration may reload the page.

Development backend output lives in `node_modules/.cache/peaper/dev`, independently of `dist`.
Use `pnpm build` then `pnpm start` for the distribution build. Use a separate port/data directory
when running more than one instance, for example `pnpm dev --no-open --port 4318 --data-dir .peaper-local/dev`.

## Coding agent in M2

- Models → Providers manages named OpenRouter and custom Chat Completions-compatible connections.
  Add multiple accounts, check a connection, and refresh its model catalog without generating text.
  Model Catalog supports search, provider filters, favorites, and Show in chat; endpoints without a
  catalog can use a manual model ID. Open model details to set output limits and supported parameters,
  then Test model to verify streaming/tool support. This explicit test can use provider credits.
- Models → Defaults selects the model/effort for new sessions. The chat picker lists enabled models
  with favorites/recent ordering and only the model's advertised effort choices. Effort has no visible
  label in the composer. Selections persist per session; changes affect subsequent tasks, while an
  active task retains its captured model, credentials, and options. See [model management](docs/Models-Management.md).
- A single agent per session streams responses, inspects files/directories, searches text/regex
  and filenames, proposes file creation/replacement or exact text edits, runs commands, updates
  the Tasks checklist, and asks structured questions with choices or free-text answers.
- Review a proposed diff or command and choose Allow once or Deny. Reads/searches are restricted
  to bounded workspace text; edits and commands always require approval. Edits recheck the file
  after approval and reject conflicting user changes. The Monaco editor remains a read-only viewer.
- Command activity shows actual output, exit code, timeout/cancellation and truncation status.
  Agent commands use noninteractive shells separately from the interactive Terminal panel.
  They have a 60-second timeout and 32,000-character output cap; use your terminal for persistent
  dev servers. Cancel task stops model generation, pending questions/permissions, and its command tree.
- Transcript, activity, proposed/applied changes, todos and completed tool messages are stored
  locally. Reloading reads the current run without re-executing it. Runtime restart marks unfinished
  runs interrupted. M3 adds the continuation controls described below.

## Continuity in M3

- Session drafts and Build/Plan mode autosave to the runtime, with a browser cache for immediate
  recovery. The last selected session is remembered. Sessions searches titles and user/assistant
  conversation text; its action menu renames and exports complete Markdown or JSON transcripts.
- The control above the composer selects Build or Plan. Plan can read/search, ask questions,
  update todos, and save a reviewable plan; the backend blocks file writes and commands.
  Review plan opens an editable plan. Save revisions before Implement reviewed plan starts a
  Build task; every resulting write or command still needs its own approval.
- Context opens estimated input use, model context metadata, output reserve, saved recap and
  instruction sources. Compact older turns summarizes older completed turns using the selected
  model, retaining two recent turns and the full original transcript. Automatic compaction runs
  near the input budget before a new task. Compaction can consume provider credits. Estimates
  use UTF-8 size with a conservative reserve; they are not a tokenizer or a billing estimate.
- Instructions load from `~/.peaper/PEAPER.md`, project `PEAPER.md`, and the selected/tool file's
  ancestor directories. Narrower rules apply within their directory, subject to the human request
  and enforced permissions. New scopes are shown to the model before the action executes.
  Context shows current sources; Instructions used on each task preserves the source text used.
- Resume appears on the latest interrupted, cancelled or failed task. It creates a new model
  turn with recovery context and fresh permissions; reconnect and restart never replay tools.
- Session actions → Fork / rewind copies a chosen conversation prefix into an independent
  session. Forks share the workspace and model selection, have independent future history/drafts,
  and do not clone files or replay inherited actions.
- Preview rewind lists later turns and conflict-checked file snapshots. Select reviewed files
  and use Restore selected files first if needed; Rewind conversation only is a separate action.
  Rewind archives later turns from active model context/search while keeping them in exports.
  It preserves unsent drafts and restores the retained plan for review when applicable.

Snapshots cover successful Peaper file-tool edits, including the pre-edit contents and new-file
creation. Manual/external changes, interrupted writes and broken checkpoint chains block restore.
Restore rechecks each file before writing; a partial failure reports how many files changed and
leaves conversation history intact. Commands, databases and external service effects are never
rolled back. Restore files before rewinding away their turns; forks have no snapshots for inherited
changes. See [M3 implementation and limits](docs/M3-Continuity-Implementation.md).

## Skills, profiles and memory in M4

- Skills discovers built-in, personal and project skill folders using `SKILL.md` YAML metadata.
  The initial procedures are code-review, debugging and testing. Create/edit instructions, import
  a local folder with resources, inspect requirements, and enable/disable manual or automatic use.
  Refresh skills rereads external filesystem changes. Built-ins are read-only and can be copied.
- Skill Inspector provides scoped invocation, instructions, a nested file browser, example resources,
  missing reference checks and script interpreter availability without executing code. Package
  dependencies and runtime versions remain declared requirements, not verified guarantees.
- Skill Activity groups task snapshots, recorded activation reasons, resource reads, approval
  decisions and actual script output/status. Older tasks clearly identify unavailable evidence.
- Default locations are `~/.peaper/skills/` and `<workspace>/.peaper/skills/`. Personal skills and
  global memory follow the active data profile: `--data-dir` relocates personal storage. Project
  skill files remain in the repository. Enable/automatic preferences are per workspace.
- Choose up to three manual skills above the composer, use `/name`, or use an explicit ID such
  as `/skill project:code-review review this patch`. Enabled bare names resolve project → personal
  → built-in. An automatic-disabled higher-priority skill also prevents silent automatic fallback
  to a lower-priority same-name procedure. All origins remain visible in Skills Manager.
- Automatic discovery supplies metadata; the primary agent chooses `load_skill` when relevant.
  Body/resource text is loaded on demand. `read_skill_resource` reads bounded text; `run_skill_script`
  requires fresh command approval, rechecks the script/instructions and passes arguments literally
  without shell parsing. It uses the same timeout, output cap, process-tree cancellation and host
  permissions as other commands. Plan mode blocks script execution. Import never executes code
  or installs dependencies; `allowed-tools` metadata does not preapprove any Peaper tool.
- Skills → Profiles manages personal/project agent profiles and the workspace default. Select a
  profile, Default profile or No profile per session. Profile/style preferences supplement scoped
  `PEAPER.md` rules and permissions. Future tasks use updated profiles; each task retains what it used.
- Memory creates/edits/deletes/searches/pins global notes, project decisions and session recaps.
  SQLite is authoritative and FTS5 updates on edit/delete. Global notes work across projects using
  this data profile, project notes stay in their workspace, and recap retrieval stays in its session.
  Pinned notes are considered first within a visible context cap; other notes are searched by task.
- Use Remember a note above the composer or `/remember project Keep the public API stable` to
  review and save a note. Supported scopes are `global`, `project` and `recap`. An agent's
  `propose_memory` output remains a pending suggestion until Save to Memory or an edited save;
  dismissing a suggestion never adds it to retrieval. Repeating a save does not duplicate it.
- Create recap in Memory lets you write a session recap or reuse its saved M3 conversation recap
  for review. You can also ask the agent to propose a recap of the actual work just completed.
  Conversation compaction remains separate from permanent memory.
- Context shows selected profiles, manual skills and scoped notes. Completed task sources preserve
  skill origin/instructions, profile revision and memory versions; JSON/Markdown exports include them.
- Memory Lens in the composer previews selected/pinned/matching notes and supports one-task include
  or exclude choices. Exclusions also constrain agent memory search; past conversation content is
  retained. Task Memory Lens records the actual initial/search selections and captured revisions.
- Memory Evidence attaches bounded snapshots of workspace files, source messages and tool results,
  with digests, excerpts and timestamps. Each note exposes sources, revision history and recorded
  usage within the current workspace. Captured evidence is not a guarantee of correctness.
- Memory Review checks title/keyword overlap and shows changes before an explicit update or keep-both
  decision. Agent suggestions remain pending until reviewed; existing revision checks protect stale
  edits. Migration 0006 preserves existing notes and seeds their current revision into history.

Deleting a memory removes the stored note and its active search entry. Historical task snapshots,
suggestions, conversation recaps and exports retain past context. Rewind does not undo saved memory,
profile settings or script/command effects. See [M4 implementation and limits](docs/M4-Knowledge-Implementation.md).

Prompts, active instructions/profiles/skills, retrieved memory and tool results used by the agent
are sent to the configured model provider. API keys
stay in the backend, encrypted in `provider.json` with a local `provider.key` master key in the
Peaper data directory. The API returns configuration/status only. Both files rely on local
filesystem access protection; encryption does not isolate them from your own account. Keep the
data directory private and outside source control. Provider errors do not echo response bodies.
Changing the endpoint does not carry an existing credential to the new destination.

The agent currently allows at most 20 model steps and 80 tool calls per task, four active sessions,
128 KB text edits, bounded search and output, ten-minute permission/question waits, and a
twenty-minute overall task limit. A limit or failure is shown explicitly; it is not reported as success.
Approval is enforced by the backend, **not an OS sandbox**. An approved command uses your host
account permissions and may access files/network or have effects that cancellation cannot undo.

## Workspace foundation

- Branded CLI, browser launch, loopback binding, startup status, configurable port/workspace,
  and native diagnostics.
- A compact dark workspace based on the agreed mockup: navigation, file explorer, editor,
  agent panel, terminal, and application preview.
- Expandable/collapsible navigation; resizable, hideable, and expandable panels; a Panels menu
  to reopen them; Reset layout; and browser preferences saved per workspace and Peaper origin.
- Read-only file browsing and a locally bundled Monaco editor with file tabs, syntax colors,
  breadcrumbs, cursor status, word wrap, reload from disk, and remembered open files.
- Session creation/selection and full-text session search, plus consistent Skills, Memory,
  Integrations, and Settings screens. Unavailable managers are explicitly marked as such.
- Persistent SQLite database, versioned/checksummed transactional migrations, Drizzle schema,
  FTS5 index/triggers, ordered events, and SSE cursor replay.
- Interactive xterm.js terminal connected to a real local PTY with input, output, resize,
  restart, stop, and cleanup. Hiding the panel keeps its shell alive; Stop shell, browser
  disconnect, or runtime shutdown ends it.
- Manual Live Preview for an existing localhost/127.0.0.1 server, with reload, width presets,
  expand/restore, disconnect, and opening in a separate browser tab. Hiding the panel retains
  its page state. The preview does not start or stop the app's dev server.
- Runtime details, loading/error/reconnecting states, responsive navigation, keyboard search,
  reduced-motion support, and bundled Inter/JetBrains Mono fonts.

The agent composer retains per-session drafts locally and in SQLite. Agent/Tasks/Context tabs show the
conversation, tool activity, checklist, workspace and selected file. Integrations remains a future milestone.

`Ctrl+B` toggles navigation, `Ctrl+K` opens a new session, and `Ctrl+backtick` toggles the terminal.
Resize handles also accept arrow keys. Narrow windows use focused panel views while retaining
the saved desktop layout. See [workspace design](docs/Peaper-UI-Workspace-Design.md).

## Data and access

By default, application data lives in `~/.peaper/peaper.sqlite`, outside the npm installation.
Override this with `--data-dir` or `PEAPER_DATA_DIR` (CLI takes precedence). Database upgrades
apply only new migrations; already applied migration changes are rejected. No data lives in
the published installation directory. Avoid placing the data directory in a source repository.

The HTTP API requires a bearer token. Browser origins and Host headers are checked; terminal
WebSockets authenticate in their first message. Local API authentication is not an OS sandbox.
The terminal runs with the permissions and environment of your account. The runtime tracks
at most four terminal processes and stops them on graceful shutdown.

The file browser is read-only, restricted to the workspace root, and bounded to 512 KB of UTF-8
text per file. Generated directories, `.git`, local attachments, `.env` secrets, and `.npmrc`
are omitted. Preview uses a separate local app origin in an iframe. Applications that prohibit
embedding can be opened in a separate browser tab; Peaper does not rewrite their security headers.

Each PTY runs in a dedicated worker process. On Windows, stopping it terminates that worker's
process tree and releases native handles. This avoids the upstream
[ConPTY teardown race in node-pty 1.1](https://github.com/microsoft/node-pty/issues/952).
These workers provide process lifecycle management, not agent delegation or OS sandbox isolation.

## Validate and package

```powershell
pnpm build
pnpm check
pnpm test:package
npm pack
```

`pnpm test:package` creates a tarball, installs it with npm into a temporary directory outside
this repository, checks the executable shim, runs native diagnostics, starts the installed app,
and validates assets, workspace detection, session creation, and startup errors. It needs network
access to install runtime dependencies. `pnpm test` expects a prior build for HTTP asset tests.
It also verifies session persistence through a runtime restart, then saves the validated tarball
and a validation report in `artifacts/`.

The temporary package name is **`@peaper/local`** and `private: true` prevents registry publication.
It is not a claim to an available npm name. A final public identity remains a release decision.

After `npm pack`, install the generated tarball locally or globally and run `peaper` from the
project directory you want to use. The tarball includes the CLI/server bundle, web assets,
fonts, SQL migrations, and README. Runtime/native dependencies are resolved by npm.

## Workspace structure

| Directory         | Responsibility                                                  |
| ----------------- | --------------------------------------------------------------- |
| `apps/cli`        | Launcher, options, banner, diagnostics                          |
| `apps/server`     | Fastify API, local access checks, SSE, WebSocket, static assets |
| `apps/web`        | React workspace UI and global design tokens                     |
| `packages/core`   | Agent/tools, providers, continuity, storage, terminal lifecycle |
| `packages/shared` | Zod API contracts and event types                               |
| `scripts`         | Build, development watcher, installed-package validation        |
| `tests`           | Persistence, migration, HTTP/SSE, and real PTY behavior         |

Scope and follow-up milestones are described in [the implementation blueprint](docs/Peaper-Implementation-Blueprint.md).
The React UI uses Tailwind v4, shared UI components, and semantic theme tokens; see
[frontend styling conventions](docs/Frontend-Styling.md).
