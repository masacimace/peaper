import type { editor } from 'monaco-editor/editor/editor.api.js';
import type { ITheme } from '@xterm/xterm';

function colors() {
  const style = getComputedStyle(document.documentElement);
  return (name: string) => style.getPropertyValue(name).trim();
}
export function normalizeThemeColor(value: string) {
  const color = value.trim();
  // CSS minification can shorten #dddddd to #ddd. Monaco's token color map
  // accepts six/eight hex digits, including colors used as token defaults.
  return /^#[\da-f]{3,4}$/i.test(color)
    ? '#' + [...color.slice(1)].map((digit) => digit + digit).join('')
    : color;
}
export function createEditorTheme(
  readColor: (name: string) => string,
  mode: 'light' | 'dark',
): editor.IStandaloneThemeData {
  const color = (name: string) => normalizeThemeColor(readColor(name));
  return {
    base: mode === 'light' ? 'vs' : 'vs-dark',
    inherit: true,
    rules: ['comment', 'keyword', 'string', 'number', 'type', 'delimiter'].map((token) => ({
      token,
      foreground: color(`--syntax-${token}`).replace('#', ''),
    })),
    colors: {
      'editor.background': color('--editor'),
      'editor.foreground': color('--text'),
      'editorLineNumber.foreground': color('--text-tertiary'),
      'editorLineNumber.activeForeground': color('--text'),
      'editor.lineHighlightBackground': color('--editor-line-highlight'),
      'editor.selectionBackground': color('--selection'),
      'editor.inactiveSelectionBackground': color('--surface-selected'),
      'editorCursor.foreground': color('--accent'),
      'editorIndentGuide.background1': color('--editor-guide'),
      'editorIndentGuide.activeBackground1': color('--border-strong'),
      'editorWidget.background': color('--surface-overlay'),
      'editorWidget.border': color('--border-strong'),
      'editorWidget.foreground': color('--text'),
      'input.background': color('--surface-inset'),
      'input.foreground': color('--text'),
      'input.border': color('--border-strong'),
      'dropdown.background': color('--surface-overlay'),
      'dropdown.foreground': color('--text'),
      'list.activeSelectionBackground': color('--surface-selected'),
      'list.activeSelectionForeground': color('--text'),
      'list.hoverBackground': color('--surface-hover'),
      'scrollbarSlider.background': color('--scrollbar'),
      'scrollbarSlider.hoverBackground': color('--scrollbar-hover'),
      'scrollbarSlider.activeBackground': color('--scrollbar-hover'),
      focusBorder: color('--accent'),
    },
  };
}
export function readEditorTheme(): editor.IStandaloneThemeData {
  const mode = getComputedStyle(document.documentElement).colorScheme;
  return createEditorTheme(colors(), mode === 'light' ? 'light' : 'dark');
}
export function readTerminalTheme(): ITheme {
  const color = colors();
  return {
    background: color('--terminal'),
    foreground: color('--text'),
    cursor: color('--accent'),
    cursorAccent: color('--terminal'),
    selectionBackground: color('--selection'),
    black: color('--ansi-black'),
    red: color('--danger'),
    green: color('--success'),
    yellow: color('--warning'),
    blue: color('--syntax-type'),
    magenta: color('--syntax-keyword'),
    cyan: color('--ansi-cyan'),
    white: color('--text-secondary'),
    brightBlack: color('--text-tertiary'),
    brightRed: color('--danger'),
    brightGreen: color('--success'),
    brightYellow: color('--warning'),
    brightBlue: color('--syntax-type'),
    brightMagenta: color('--syntax-keyword'),
    brightCyan: color('--ansi-cyan'),
    brightWhite: color('--text-strong'),
  };
}
