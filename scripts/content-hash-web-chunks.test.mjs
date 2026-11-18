import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { contentHashWebChunks } from './content-hash-web-chunks.mjs';

const OLD = (name) => `${name}-${'0'.repeat(32)}.js`;
let dir;

function fakeExport({ layoutBody }) {
  dir = mkdtempSync(join(tmpdir(), 'web-chunks-'));
  const js = join(dir, '_expo', 'static', 'js', 'web');
  mkdirSync(js, { recursive: true });
  writeFileSync(join(js, OLD('_layout')), layoutBody);
  writeFileSync(join(js, OLD('entry')), `load("/app/_expo/static/js/web/${OLD('_layout')}")`);
  writeFileSync(join(js, 'not-hashed.js'), 'untouched');
  writeFileSync(
    join(dir, 'index.html'),
    `<script src="/app/_expo/static/js/web/${OLD('entry')}" defer></script>`,
  );
  return js;
}

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('contentHashWebChunks', () => {
  it('renames files by their contents and rewrites references', () => {
    const js = fakeExport({ layoutBody: 'layout v1' });
    const renamed = contentHashWebChunks(dir);

    const files = readdirSync(js).sort();
    const layout = files.find((name) => name.startsWith('_layout-'));
    const entry = files.find((name) => name.startsWith('entry-'));
    expect(renamed[OLD('_layout')]).toBe(layout);
    expect(renamed[OLD('entry')]).toBe(entry);
    expect(files).toContain('not-hashed.js');
    expect(readFileSync(join(js, entry), 'utf8')).toContain(layout);
    expect(readFileSync(join(dir, 'index.html'), 'utf8')).toContain(entry);
  });

  it('gives the entry a new name when only a chunk it loads changed', () => {
    fakeExport({ layoutBody: 'layout v1' });
    contentHashWebChunks(dir);
    const first = readFileSync(join(dir, 'index.html'), 'utf8');
    rmSync(dir, { recursive: true, force: true });

    // Same entry source, same names from Expo: the bug that crashed the app.
    fakeExport({ layoutBody: 'layout v2' });
    contentHashWebChunks(dir);
    const second = readFileSync(join(dir, 'index.html'), 'utf8');

    expect(second).not.toBe(first);
  });

  it('gives the same names to the same build', () => {
    fakeExport({ layoutBody: 'same' });
    contentHashWebChunks(dir);
    const first = readFileSync(join(dir, 'index.html'), 'utf8');
    rmSync(dir, { recursive: true, force: true });

    fakeExport({ layoutBody: 'same' });
    contentHashWebChunks(dir);
    expect(readFileSync(join(dir, 'index.html'), 'utf8')).toBe(first);
  });
});
