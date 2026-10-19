# Peaper workspace design

Agreed direction: 19 October 2026 (Asia/Jakarta), following the user's `1000058991.jpg` mockup
and the discussion about modular panels, navigation collapse, and Live Preview.

## Visual direction

Use the mockup's compact, editor-focused dark workspace: neutral charcoal surfaces, thin
dividers, restrained green status accents, small corner radii, Inter for controls, and JetBrains
Mono for source and terminal text. Fonts, editor assets, and workers are bundled locally.
Global tokens live in `apps/web/src/styles/tokens.css`; layout and controls share semantic tokens.

Five color schemes are available in Settings → Appearance & layout: Peaper Ink (default),
Peaper Mono, and Peaper Midnight are dark; Peaper Paper is neutral light and Peaper Linen is
warm light. Canonical palettes live in `apps/web/src/styles/themes.css`. Panels, controls,
empty states, status colors, syntax highlighting, and terminal colors use shared semantic
tokens instead of literal colors in components.

The choice is saved in this browser under `peaper:theme`, applies across workspaces, and
synchronizes between tabs. A small local bootstrap selects it before the first paint; invalid
preferences fall back to Ink. Switching updates the existing Monaco and xterm instances,
preserving open files, editor position, drafts, terminal output, and the running shell.
Only the Preview frame and its controls follow Peaper's theme. Embedded applications retain
their own appearance and are not reloaded or restyled by theme changes.

## Workspace structure

The main navigation contains Workspace, Sessions, Skills, Memory, Integrations, and Settings.
Expanded navigation is 200 px; the collapsed icon rail is 52 px with accessible names and
hover/focus tooltips. The active workspace and real runtime status sit at the bottom.

The Agent panel sits beside navigation on the left and spans the workbench height. The editor
occupies the upper work area with Files on its right. Terminal and Preview share the lower work area. Agent provides
Agent, Tasks, and Context tabs. The initial version shows available data and explicit pending
states rather than claiming a model connection or implemented managers.

## Modular behavior

- Files, Agent, Terminal, and Preview can be resized, hidden, reopened from Panels, and expanded
  into a focused view. Editor also supports a focused view.
- Panel headers and resize handles are shared primitives. Feature modules own their content;
  runtime data, browser preferences, file reads, and presentation have separate modules.
- Keyboard users can resize with arrow keys. Pointer capture keeps dragging stable across
  the editor, terminal, and iframe.
- The sidebar preference, panel visibility, panel dimensions, and focused view are persisted
  per workspace in browser storage. Open file tabs and the manually selected preview URL
  are also remembered. Invalid or unsupported preference data falls back to defaults.
- Reset layout restores panel preferences without deleting sessions, files, or user data.
- Narrow windows expose panels in focused views so the editor remains usable. Desktop sizes
  remain saved for a larger window. Mobile navigation can expand as an overlay.
- Hiding a panel retains its live view. Hiding Terminal preserves the shell; Stop shell is an
  explicit separate action. Browser disconnect still ends that shell in M1.

## Live Preview

The initial implementation accepts a manual HTTP(S) URL on `localhost` or `127.0.0.1`, on a
different port from Peaper. The user starts the application's dev server independently.
Peaper does not send its API access token to the preview app and does not start/stop its server.

Preview offers reload, a URL field, Auto/Desktop/Tablet/Mobile width presets, expand/restore,
disconnect, and Open in browser. Width presets change the actual iframe viewport width;
they do not emulate a full device. Hiding/reopening retains the iframe and its current page.
Disconnect intentionally removes that iframe and forgets the saved URL.

The iframe has its own local origin and restricted embedding permissions. Applications that
block framing remain subject to their own headers and can be opened in a separate browser tab.
No reverse proxy or application-header rewriting is included.

## M1 functionality and later milestones

Read-only browsing, editor tabs and highlighting, terminal interaction, session management,
runtime details, layout controls, and manual preview work in M1. Model calls, saving source
changes, agent tools, automated server management, and full Skills/Memory/MCP managers follow
their implementation milestones. The shared panel and manager structures establish their
visual foundation now.

The read-only file service bounds reads, validates canonical paths, excludes generated/private
content, and rejects paths and junctions outside the workspace. The editor never writes a file.
UI access authentication and terminal lifecycle management remain separate from an OS sandbox.
