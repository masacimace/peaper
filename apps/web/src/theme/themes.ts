export const themeStorageKey = 'peaper:theme';
export const themes = [
  { id: 'ink', name: 'Peaper Ink', mode: 'dark', description: 'Charcoal and soft sage.' },
  { id: 'mono', name: 'Peaper Mono', mode: 'dark', description: 'Neutral black and grayscale.' },
  {
    id: 'midnight',
    name: 'Peaper Midnight',
    mode: 'dark',
    description: 'Deep navy and pale blue.',
  },
  { id: 'paper', name: 'Peaper Paper', mode: 'light', description: 'Clean white and slate blue.' },
  { id: 'linen', name: 'Peaper Linen', mode: 'light', description: 'Warm ivory and muted olive.' },
] as const;
export type ThemeId = (typeof themes)[number]['id'];
export const defaultTheme: ThemeId = 'ink';
export function normalizeTheme(value: unknown): ThemeId {
  return themes.find((theme) => theme.id === value)?.id ?? defaultTheme;
}
