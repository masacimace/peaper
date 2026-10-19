# M4 Skills, Profiles and Memory — Implementation record

Date: 20 October 2026 (Asia/Jakarta). Preview version: `0.4.0-knowledge.1`.

## Delivered

M4 adds reusable procedures, agent profiles and durable scoped notes to the existing single
primary agent. Skills and Profiles share a manager page; Memory has its own sidebar page.
Composer controls stay separate from the model/effort picker, and all controls use semantic
theme tokens. The existing five themes, resizable panels, Plan rules and scrollbar behavior remain.

| Capability           | Result                                                                                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skill discovery      | Built-in, personal and project origins, YAML metadata, requirements, bounded filesystem discovery and visible validation errors                                              |
| Skills Manager       | Create/edit SKILL.md, import a local folder with resources, copy built-ins, inspect resource text, refresh external changes, enable/disable and automatic/manual preferences |
| Manual invocation    | Composer selection, `/name`, or `/skill project:name`; scoped names and precedence are explicit                                                                              |
| Automatic invocation | Metadata catalog, find_skills, load_skill, on-demand resource reads and transparent task snapshots                                                                           |
| Skill scripts        | Supported interpreters, literal arguments, separate approval, script/instruction recheck, timeout/output/cancellation policy, Plan enforcement                               |
| Profiles             | Personal/project create/edit/enable/delete, workspace default, session override and captured instructions on each task                                                       |
| Memory               | Global/project/recap create/edit/delete/search/pin, source session/task, revisions, timestamps and scope-filtered retrieval                                                  |
| Saving intent        | Explicit manager/composer save or review of a pending agent suggestion; dismissed suggestions never become retrieved notes                                                   |
| Recaps               | Agent-proposed recap suggestions and manual recap creation, with optional reuse of the saved M3 recap for review                                                             |
| Persistence          | Additive migrations 0005–0006, SQLite/FTS5, memory revision journal, session preferences, fork preference copy and JSON/Markdown context exports                             |

## Module boundaries

| Location                                          | Responsibility                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `packages/shared/src/knowledge.ts`                | Skill, profile, context selection, memory, suggestion and source snapshot contracts                          |
| `packages/core/src/skills/builtins.ts`            | Bundled code-review, debugging and testing procedures                                                        |
| `packages/core/src/skills/service.ts`             | YAML metadata, scope resolution, file safety, resource bounds, create/edit/import and interpreter selection  |
| `packages/core/src/knowledge/store.ts`            | Parameterized persistence, revisions, scope checks, FTS retrieval, profile defaults and suggestion decisions |
| `packages/core/src/knowledge/service.ts`          | Runtime context assembly, manual/automatic selection, progressive skill loading and model guidance           |
| `packages/core/src/knowledge/memory-service.ts`   | Evidence capture, overlap review, explicit commit decisions and preview integrity checks                     |
| `packages/core/src/knowledge/memory-retrieval.ts` | Bounded keyword selection, one-task overrides and explainable selection records                              |
| `packages/core/src/knowledge/export.ts`           | Human-readable historical context/suggestion exports                                                         |
| `packages/core/src/agent/runtime.ts`              | Knowledge-aware tools, captured selections, Plan checks, approval lifecycle and context preflight            |
| `packages/core/src/agent/commands.ts`             | Shared shell/program process lifecycle; script argument arrays bypass shell parsing                          |
| `packages/core/migrations/0005_knowledge.sql`     | Persistent tables, indexes and insert/update/delete memory FTS triggers                                      |
| `apps/server/src/knowledge.ts`                    | Authenticated knowledge, skills, profiles, memory and suggestion routes                                      |
| `apps/web/src/features/skills/`                   | Skills Manager, local import, document editing, resource view and Profiles                                   |
| `apps/web/src/features/memory/`                   | Memory Manager, explicit save/review forms and suggestion cards                                              |
| `apps/web/src/features/knowledge/`                | Session preference hook, bounded composer popup and shared source views                                      |
| `tests/knowledge.test.ts`                         | End-to-end local provider/tool tests, scope, resources, integrity and persistence checks                     |
| `tests/fixtures/m4-preview.ts`                    | Isolated browser QA with real local skill files, command execution and memory persistence                    |

## Skills and permissions

The SKILL.md format follows [Agent Skills](https://agentskills.io/specification): YAML
frontmatter with name/description and optional compatibility, followed by Markdown instructions.
The name matches the folder and uses a portable lowercase ASCII slug, at most 64 characters.
Metadata parsing uses the [yaml package](https://eemeli.org/yaml/) with duplicate keys rejected
and alias expansion disabled. Unknown frontmatter is preserved by the raw document editor.

Default personal storage is `~/.peaper/skills/`; a custom data directory relocates this profile's
personal library. Project storage is `<workspace>/.peaper/skills/`. Built-ins are bundled as
read-only SKILL.md documents in the backend, so package installation never overwrites user skills.
Personal/project documents remain ordinary editable files; the manager uses digest checks to
reject stale edits. Import copies a validated local folder into a new destination, preserving
existing skills. Hidden/private files and generated dependencies are excluded. Remote UNC paths,
symlinks/junctions, traversal, invalid metadata and oversized resources are rejected.

All same-name origins remain visible. A bare invocation chooses the highest-priority enabled
project, personal or built-in skill, in that order; explicit scoped IDs select their exact origin.
Automatic invocation uses that same resolution, then checks automatic eligibility. It never
silently substitutes a lower-priority procedure when the selected origin is manual-only.

Discovery reads bounded metadata and injects no body. The initial model catalog contains at most
24 resolved automatic metadata entries; find_skills searches the discovered catalog for relevant
entries. Manual selections load before the turn. Automatic activation happens through load_skill,
with the chosen source/instructions recorded in the task. Resource contents are read on demand.
Script/resource paths remain relative to the loaded skill root; assets are listed and copied,
while model resource reading is limited to UTF-8 text. Binary asset interpretation is outside M4.

run_skill_script accepts an already loaded skill, scripts-relative path and argument array.
Supported scripts are JavaScript (`.js`, `.mjs`, `.cjs`), Python (`.py`), PowerShell (`.ps1` on
Windows) and POSIX shell (`.sh` on POSIX). The interpreter must already be installed. The approval
shows the program and literal arguments. No script runs during import/discovery. Script and
instruction digests are rechecked after approval, and execution uses a direct program/argv call
with the existing command timeout, output bound and process-tree cancellation. Plan blocks the
tool at both advertisement and execution. The Agent Skills experimental allowed-tools field
never grants Peaper permissions. Approved programs still use host permissions, not an OS sandbox.

### Skill Inspector and Skill Activity

Opening a skill now shows Skill Inspector with Overview, Instructions and Files tabs. Overview
shows the exact scoped invocation, origin/digest, declared compatibility, detected script
interpreters and bounded file-reference checks. Files presents a nested folder tree with
read-only SKILL.md/resource previews; example resources are linked from Overview. Refresh
re-inspects the current files. Inspection also works for disabled skills and never executes
scripts. Checks cover inline Markdown links and conventional resource paths in SKILL.md;
they do not recursively validate documentation links, package dependencies or runtime versions.
Availability checks inspect interpreter files on PATH, not their behavior. Existing resource
limits and authorization apply to the new `/api/skills/:id/inspection` route.

Skill Activity groups each task's persisted skill snapshots, activations, resource reads,
script attempts, approval decisions and runner output. Discovery searches remain distinct
from activation. Manual activation records slash/composer origin; automatic load_skill can
include a short user-facing task-match reason. Historical tasks with no recorded reason say
so explicitly. Script statuses use the actual exit/cancellation/timeout result. Inspection
always views current disk content; activity instruction snapshots and recorded outputs retain
the task's historical evidence. Existing task persistence/export carries the optional reason,
so no database migration is needed. A Test Skill feature is intentionally outside this change.

## Profiles, notes and context

Profiles contain user-selected behavior/style instructions, with personal or project scope.
The workspace default may be overridden by Default profile, No profile or a specific enabled
profile per session. Profiles supplement mandatory scoped PEAPER.md rules; choosing No profile
does not disable those rules. Each task preserves the profile revision it actually loaded.
The response author label uses that captured profile name, with Peaper as the fallback when
no profile was captured. Renaming or deleting a profile does not rename past responses.

Global memory is shared across workspaces in the same Peaper data profile. Project notes are
workspace-owned. Session recap retrieval additionally requires its source session. Manager
search is scope-filtered; source session and task references are validated. SQLite is authoritative;
the FTS5 index is updated transactionally by insert/update/delete triggers. Title/body updates
and deletions use revision checks to reject stale edits. No vector extension or embedding model
is required.

The explicit Remember a note action and `/remember [global|project|recap] text` open a review
form. They do not need model generation. Natural-language requests to remember something can
produce a propose_memory suggestion from the model. This remains pending until a human Save to
Memory or edited save, or may be dismissed. Decisions are persistent and idempotent; retrying a
saved suggestion does not duplicate the note, and deleting that note does not recreate it when
the old suggestion is retried. The original source session/task is retained after an edited save.

Pinned memory is considered first within scope; unpinned notes are retrieved from task text.
Explicit search_memory queries search the scoped index directly, so a large pin set cannot hide
a targeted search result. Used note bodies, revisions, scope and source are visible on the task.
Pinned overflow is reported. Knowledge and metadata contribute to M3's conservative context
estimate/preflight. Profile/skill/memory content does not bypass tool permissions or the user request.

Recaps remain a separate memory type. Users may save an agent's proposed recap of actual outcomes,
write one in Memory Manager, or review/reuse an existing M3 conversation summary. Saving is explicit;
conversation compaction does not automatically create permanent notes. A fork copies conversation
and context selections; current recap retrieval stays bound to the new session. Global/project
notes remain shared within their scopes.

Deleting a note removes its live row and FTS entry. It does not erase previously captured task
context, historical tool results, suggestions, conversation summaries or exports. New retrieval
uses current stored notes; an already running task retains its captured context. Saved memory,
profiles and script/command effects are independent of conversation rewind and file snapshots.
The provider receives selected instructions and retrieved notes when used, alongside the prompt
and tool results. Credentials remain backend-only.

## Memory Lens, Evidence and Review

The composer opens Memory Lens for the current draft without a provider request. Auto, Include
and Exclude choices apply to one sent task, with at most six manual includes. Manual notes are
considered before pins and keyword matches. Preview explains selection, exclusion and budget
omissions. It considers up to 100 recent scoped notes plus up to 100 FTS matches. The actual
task re-evaluates current revisions, captures its choices, and preserves reasons/stages for
initial and later tool retrieval. Exclusions also constrain search_memory; they do not erase
earlier conversation content. Oversized explicit includes fail before generation. Existing
12-note/32 KB retrieval and 24-version/64 KB task limits continue to apply.

Memory Evidence accepts at most eight references to regular workspace files, task messages or
persisted tool activities. The backend captures SHA-256 digests, timestamps and up to 2,000
characters per source; no file is executed. File reads inherit workspace/data exclusions and
reject junctions and private key files. Activities record actual status and command exit/timeout/
cancellation outcomes when available. Source user requests are attached when room is available.
Existing references retain their captured evidence on edits. A note's evidence dialog exposes
captured sources, up to 50 revisions and usage in up to 50 recent matching tasks in this workspace.
Usage means context inclusion, not proof that the note affected an answer. Global notes retain
their approved captured evidence across the same data profile, while full source-task views and
project-scoped historical revisions remain workspace-scoped.

Memory Review compares titles/keywords against up to 100 recent notes in the same scope (and
source session for recaps), displaying at most five possible overlaps. This is a deterministic
overlap aid, not semantic contradiction detection. Users may keep both or explicitly update a
selected revision; editing an existing note also shows a diff. Pending agent proposals can be
edited or dismissed and preserve their original source. Input/evidence fingerprints and revision
checks reject changes after preview. Proposal decisions remain idempotent. Review and evidence
inspection do not invoke a provider or modify notes until an explicit save action.

Additive migration 0006 adds captured evidence and a transactional revision journal, seeding each
existing note's current revision. Earlier edits cannot be reconstructed. Only current notes enter
FTS/retrieval; history is never re-indexed. Deleting a current note removes its live revision
journal and evidence, while historical task snapshots and conversation exports remain intact.
The UI adds no automatic memory rewrites, health tracking, embedding search or Debug Journal.
Dialogs render outside workspace panels so responsive panel hiding does not hide an open dialog
or leave its modal focus trapped. Desktop, 390 px mobile and Peaper Linen were inspected through
the local browser fixture, including include/exclude, real script evidence, proposal update,
manual file attachments, revision history and source-task views.

## Bounds and verification

| Resource                          | Bound                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------- |
| Discovery                         | First 100 entries per personal/project root, with a visible truncation notice |
| Skill document / metadata         | 64 KB / bounded 16 KB frontmatter                                             |
| Skill folder resources            | 128 regular files including SKILL.md, 2 MB total, six directory levels        |
| Resource files                    | 512 KB each for import; 64 KB UTF-8 for text reads; 128 KB scripts            |
| Manual / loaded skills            | 3 manual selections, 6 loaded instruction versions per task                   |
| Initial / searched memory context | Up to 12 notes / 32 KB per retrieval; task accumulator 24 versions / 64 KB    |
| Memory / profile body             | 8,000 characters each                                                         |
| Pins / suggestions                | 20 pins per scope in a workspace/profile, 3 suggestions per task              |
| Manager results                   | First 100 matching notes; refine search for older records                     |
| Script lifecycle                  | 60 seconds, 32,000 output characters, cancellation of process tree            |

Automated tests use deterministic local model responses with actual file and command effects.
They verify lazy discovery, manual/scoped and automatic activation, preferences, source collisions,
metadata validation, import/resource safety, stale edits, script approval/integrity and literal
arguments (including quotes/newlines), Plan restrictions, captured profiles, restart/fork preferences,
global/project/session isolation, FTS update/delete, targeted search beyond pins, pending/edited/
dismissed/idempotent suggestions and context overflow notices. Existing M1–M3 tests continue to run.

Browser QA covers skill create/edit/import, manual-only preferences, profiles/default selection,
memory create/edit/pin/search, manual skill invocation, real script approval/result, saving project
and session suggestions, `/remember`, source views and responsive layouts. Provider generation for
M4 validation uses the isolated local fixture; no live paid generation is required.

Installed-package validation builds a tarball, installs it outside the repository, verifies native
dependencies and M1–M3 behavior, creates a skill/profile/note through the installed API, restarts the
package and verifies persisted context, then confirms deleted notes leave active search.

MCP/hooks, Git/worktrees and background task management remain M5. Release publishing and broader
platform verification remain M6.
