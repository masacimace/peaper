# Peaper

A local coding workspace, launched from your project and opened in your browser.

This is the **M1 Foundation** preview, with the modular workspace redesign. The launcher,
session storage, local file browser, read-only editor, live preview, and interactive terminal work.
Model integration and the coding loop begin in M2.

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

## What works in M1

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

The agent composer supports local in-memory drafts; sending remains disabled until model
integration is implemented. Agent/Tasks/Context tabs show the available workspace information.
Sessions currently store metadata; there is no simulated assistant response or tool execution.

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
| `packages/core`   | Database, migrations, terminal lifecycle, native probes         |
| `packages/shared` | Zod API contracts and event types                               |
| `scripts`         | Build, development watcher, installed-package validation        |
| `tests`           | Persistence, migration, HTTP/SSE, and real PTY behavior         |

Scope and follow-up milestones are described in [the implementation blueprint](docs/Peaper-Implementation-Blueprint.md).
