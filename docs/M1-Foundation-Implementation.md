# M1 Foundation — Implementation record

Date: 19 October 2026 (Asia/Jakarta).

M1 implements the first milestone in `Peaper-Implementation-Blueprint.md`. The initial local
distribution uses the private, provisional package name `@peaper/local`, version
`0.1.0-foundation.1`, and exposes the `peaper` executable. No npm publication is performed.

## Delivered

- A pnpm workspace with separate CLI, server, web, core, and shared-contract modules.
- Strict TypeScript, ESLint, Prettier, a reproducible lockfile, and a build/package workflow.
- CLI workspace detection, banner, browser launch, `--port`, `--no-open`, `--workspace`,
  `--data-dir`, `--version`, `--help`, and `doctor`.
- Loopback Fastify runtime, authenticated HTTP API, health/workspace/session contracts,
  static web assets, and ordered SSE event replay with cursors and backpressure handling.
- SQLite with WAL, Drizzle schema/query access, checksummed transactional migrations,
  session persistence, FTS5 indexing, and scoped session search. Running session metadata is
  marked interrupted when a runtime reopens that workspace; no command is automatically retried.
- Modular dark React workspace based on the agreed mockup: collapsible navigation,
  file explorer, read-only Monaco editor, Agent/Tasks/Context, terminal, and manual local preview.
- Resizable/hideable/expandable panels, a Panels menu, Reset layout, remembered workspace
  preferences and file tabs, session creation/selection/search, and runtime diagnostics.
- Matching Sessions, Skills, Memory, Integrations, and Settings screens. Agent drafts are local;
  sending and unimplemented managers remain clearly unavailable.
- Working xterm.js terminal, WebSocket authentication, input/output, resize, restart, and stop.
- Global color/type/spacing/motion tokens, responsive navigation, reduced-motion handling,
  and bundled Inter and JetBrains Mono fonts.
- A tarball containing the launcher/server, terminal worker, web assets/fonts, and migrations.
  Native modules remain runtime dependencies installed for the consumer platform.

## Native terminal decision

The installed `node-pty` 1.1.0 exposes a race in its Windows system-ConPTY cleanup path.
The bundled-ConPTY path avoids that helper race, but a direct in-process prototype left a
native output worker keeping Node alive after shutdown.

Peaper therefore runs each native PTY in a dedicated child process. On Windows, terminal stop
targets only that worker's process tree through `taskkill /T /F`; the backend awaits its exit.
Natural shell exit reports its real exit code and closes the worker. This keeps native handles
out of the server process. A regression test verifies that a command running beneath PowerShell
also stops. These are terminal processes, not model subagents, and they provide no OS sandbox.

Reference: [upstream node-pty cleanup race](https://github.com/microsoft/node-pty/issues/952).

## Validation

Validated locally on Windows 10 x64 using Node 24.21.0, pnpm 12.14.0, and npm 12.2.0.
The supported Node range is initially restricted to 24.x; other OS/ABI combinations are not
claimed as validated by this milestone.

- Production build, strict typecheck, ESLint, and formatting checks.
- Twelve integration/regression tests covering storage reopen, FTS insert/update/delete,
  workspace scoping, migration integrity, API authorization/origin, SSE replay, WebSocket
  credentials, real terminal I/O/resize/cleanup, natural exit, Windows child-process cleanup,
  bounded file reads and junction containment, layout recovery, and local-preview URL validation.
- `doctor` verifies SQLite, FTS search, shell startup, input/output, resize, and shutdown.
- Installed-package test: `npm pack`, npm installation into a fresh temporary directory
  outside the repository, actual `peaper` execution via npm, native diagnostics, HTTP assets,
  workspace detection, sessions, restart persistence, port conflicts, and invalid CLI options.
- Browser review includes code rendering, layout resize/persistence, collapse/expand,
  panel hide/reopen, local preview interaction and viewport sizing, sessions, settings,
  runtime details, narrow navigation, and dialog focus.

The accepted visual and interaction contract is recorded in `Peaper-UI-Workspace-Design.md`.

## Boundary for M2

Provider configuration, live model calls, the agent/tool loop, file editing/diff review,
tool permissions, and agent cancellation belong to M2. M1 uses no model credentials.
Session transcript continuity, planning, snapshots, and deeper recovery follow in M3.
API access tokens and terminal process management are not an OS sandbox; terminal execution
currently uses host account permissions.

See `README.md` for running, diagnostics, data locations, and package validation commands.
