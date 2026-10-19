import { z } from 'zod';

export const panelIds = ['files', 'agent', 'terminal', 'preview'] as const;
export type PanelId = (typeof panelIds)[number];
export type FocusedPanel = PanelId | 'editor';
export const defaultLayout = {
  version: 1 as const,
  sidebarCollapsed: false,
  visible: { files: true, agent: true, terminal: true, preview: true },
  sizes: { files: 192, agent: 328, bottom: 282, bottomSplit: 0.5 },
  maximized: null as FocusedPanel | null,
};
const schema = z.object({
  version: z.literal(1),
  sidebarCollapsed: z.boolean(),
  visible: z.object({
    files: z.boolean(),
    agent: z.boolean(),
    terminal: z.boolean(),
    preview: z.boolean(),
  }),
  sizes: z.object({
    files: z.number().finite().min(150).max(360),
    agent: z.number().finite().min(270).max(520),
    bottom: z.number().finite().min(150).max(600),
    bottomSplit: z.number().finite().min(0.25).max(0.75),
  }),
  maximized: z.enum(['editor', ...panelIds]).nullable(),
});
export type WorkspaceLayout = z.infer<typeof schema>;

export function readLayout(serialized: string | null): WorkspaceLayout {
  try {
    const result = schema.safeParse(JSON.parse(serialized || 'null'));
    if (result.success) return result.data;
  } catch {
    /* A damaged or older preference never blocks opening a workspace. */
  }
  return structuredClone(defaultLayout);
}
export function resizeLayout(
  layout: WorkspaceLayout,
  name: keyof WorkspaceLayout['sizes'],
  delta: number,
): WorkspaceLayout {
  if (!Number.isFinite(delta)) return layout;
  const bounds = {
    files: [150, 360],
    agent: [270, 520],
    bottom: [150, 600],
    bottomSplit: [0.25, 0.75],
  } as const;
  const [min, max] = bounds[name];
  return {
    ...layout,
    sizes: { ...layout.sizes, [name]: Math.min(max, Math.max(min, layout.sizes[name] + delta)) },
  };
}
