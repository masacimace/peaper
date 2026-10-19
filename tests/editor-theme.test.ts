import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createEditorTheme, normalizeThemeColor } from '../apps/web/src/theme/editor-themes.js';
import { themes } from '../apps/web/src/theme/themes.js';

test('Monaco colors expand CSS shorthand while retaining full hex and alpha values', () => {
  assert.equal(normalizeThemeColor('#ddd'), '#dddddd');
  assert.equal(normalizeThemeColor('  #fff  '), '#ffffff');
  assert.equal(normalizeThemeColor('#abcd'), '#aabbccdd');
  assert.equal(normalizeThemeColor('#ABCDEF'), '#ABCDEF');
  assert.equal(normalizeThemeColor('#41474b88'), '#41474b88');
});

test('all five production CSS palettes produce valid Monaco token defaults and rules', async () => {
  const directory = 'dist/web/assets';
  const filename = (await readdir(directory)).find((name) => /^index-.*\.css$/.test(name));
  assert.ok(filename, 'Run pnpm build before checking the production palettes.');
  const css = await readFile(join(directory, filename), 'utf8');
  for (const theme of themes) {
    const marker = `[data-theme-preview=${theme.id}]`;
    const start = css.indexOf(marker);
    assert.ok(start >= 0, `Missing production palette: ${theme.name}`);
    const block = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
    const tokens = Object.fromEntries(
      [...block.matchAll(/(--[\w-]+):([^;]+);?/g)].map((match) => [match[1]!, match[2]!]),
    );
    const data = createEditorTheme((name) => {
      assert.ok(tokens[name], `Missing ${name} in ${theme.name}`);
      return tokens[name]!;
    }, theme.mode);
    for (const [name, value] of Object.entries(data.colors)) {
      assert.match(value, /^#[\da-f]{6}(?:[\da-f]{2})?$/i, `${theme.name}: ${name}`);
    }
    for (const rule of data.rules) {
      assert.match(
        rule.foreground!,
        /^[\da-f]{6}(?:[\da-f]{2})?$/i,
        `${theme.name}: ${rule.token}`,
      );
    }
    if (theme.id === 'mono') assert.equal(data.colors['editor.foreground'], '#dddddd');
    if (theme.id === 'paper') assert.equal(data.colors['editor.background'], '#ffffff');
  }
});
