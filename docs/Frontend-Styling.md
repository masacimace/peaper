# Frontend styling

Peaper uses Tailwind CSS v4 as the main styling approach. Layout, spacing, typography,
responsive behavior, and component states live beside their React markup. The migration
preserves the existing workspace design and M2 behavior.

## Responsibilities

| Location                         | Responsibility                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/styles/themes.css` | The five canonical color palettes: Ink, Mono, Midnight, Paper, Linen                                                 |
| `apps/web/src/styles/tokens.css` | Tailwind theme, semantic color aliases, fonts, sizes, spacing, breakpoints, and shared design values                 |
| `apps/web/src/styles/base.css`   | Global browser defaults, scrollbars, resize isolation, and xterm integration                                         |
| `apps/web/src/components/ui/`    | Shared controls: Button, IconButton, Field, Input, Select, Badge, StatusDot, EmptyState, notices, and page structure |
| `apps/web/src/layout/`           | Shared panel frame, panel menu, and accessible resize handle                                                         |
| `apps/web/src/features/`         | Feature markup and its Tailwind utilities                                                                            |

The former `app.css` and `m2.css` are removed. Organize new styling by component or feature,
without adding a separate stylesheet for each milestone.

## Component conventions

- Use shared controls when their behavior and appearance match. Compose feature-specific
  markup directly; extract a component when repetition represents a meaningful shared UI.
- Use semantic colors such as `bg-surface-panel`, `border-border-subtle`, `text-muted`,
  `text-accent`, and `bg-danger-soft`. Add a palette token when a new color role is needed.
  Keep literal palette colors out of components.
- Use `cn()` from `components/ui/cn.ts` for conditional classes and shared-component
  overrides. It resolves conflicting utilities while keeping custom text sizes and colors
  independent. For example, `text-caption text-muted` can become `text-label text-danger`.
- Write complete utility names in conditional branches or static maps. Tailwind must see
  `bg-success` in source; it cannot discover a class constructed as `bg-${status}`.
- Use `aria-*`, `data-*`, `peer-*`, and `group-*` variants for visible state. Keep accessible
  names and selected/expanded states on the actual controls.
- Default shared buttons have `type="button"`. Set `type="submit"` explicitly in forms.
- Use inline styles for runtime measurements such as resized panel dimensions, file-tree
  indentation, and the iframe viewport width. Static appearance belongs in utilities.
- Use custom CSS for browser or third-party integration that cannot reasonably belong to
  a React component. Put global resets in `@layer base` so utilities can override them.
- Agent and Monaco use the shared `scroll-surface` integration in `base.css`. Their 4 px
  thumbs appear on scroll and fade after two seconds of inactivity via `useScrollActivity`.
  Track geometry stays reserved, so idle visibility does not move the content. Monaco retains
  a wider transparent track for dragging; its slider uses the same semantic theme colors.
  The registered `--scrollbar-visibility` property animates both implementations together:
  200 ms reveal and 400 ms fade, with reduced-motion preferences respected.

The spacing unit is 4 px. Named text sizes retain the compact workspace scale, from
`text-tiny` (7 px) through `text-body` (13 px), with separate title sizes. Responsive
breakpoints are `compact` (680 px), `tablet` (860 px), and `workspace` (1180 px). The `short`
variant handles windows up to 650 px tall.

## Themes and embedded applications

Tailwind color aliases resolve to the active semantic CSS variables. Theme samples scope the
same variables with `data-theme-preview`. Monaco and xterm still read those canonical values
through their own theme adapters; preserve full hexadecimal normalization for Monaco.

Peaper themes apply to Preview's frame and controls. The iframe page keeps its own theme.
Changing Peaper's theme must preserve the iframe, editor position, drafts, and running shell.

## Formatting and verification

`prettier-plugin-tailwindcss` sorts utility classes using Peaper's v4 stylesheet and recognizes
`cn()` calls. Run the normal formatter after editing:

```powershell
pnpm format
pnpm build
pnpm check
```

Build before running the tests, since HTTP and editor-theme tests inspect production assets.
Verify changed views in dark and light schemes and at desktop and narrow widths. For agent
UI changes, use the deterministic local M2 fixture without a paid provider request:

```powershell
pnpm exec tsx tests/fixtures/m2-preview.ts
```

Configure that isolated runtime with its printed fixture provider URL and `fixture-model`.
The fixture uses temporary files and real commands; it does not modify the main workspace.
