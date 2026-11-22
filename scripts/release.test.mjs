import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { LANGUAGES, bump, checkTag, isNewer, notesProblems, notesTemplate, readNotes } from './release.mjs';

let dir;

function fakeRepo(version = '1.0.10') {
  dir = mkdtempSync(join(tmpdir(), 'release-'));
  mkdirSync(join(dir, 'docs', 'releases'), { recursive: true });
  writeFileSync(join(dir, 'app.json'), JSON.stringify({ expo: { name: 'Pinch', version } }));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'pinch', version }));
  writeFileSync(
    join(dir, 'package-lock.json'),
    JSON.stringify({ name: 'pinch', version, packages: { '': { name: 'pinch', version } } }),
  );
  return dir;
}

function filledNotes(version, text = 'Saves you time.') {
  return notesTemplate(version).replace(/^(## (?!What changed).+\n\n)/gm, `$1${text}\n\n`);
}

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('isNewer', () => {
  it('compares each part as a number', () => {
    expect(isNewer('1.0.11', '1.0.10')).toBe(true);
    expect(isNewer('1.0.9', '1.0.10')).toBe(false);
    expect(isNewer('2.0.0', '1.9.9')).toBe(true);
    expect(isNewer('1.0.10', '1.0.10')).toBe(false);
  });
});

describe('bump', () => {
  it('sets the version in every file and creates the notes', () => {
    const root = fakeRepo();
    const result = bump(root, '1.0.11');

    expect(result).toMatchObject({ from: '1.0.10', created: true });
    expect(JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo.version).toBe('1.0.11');
    expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version).toBe('1.0.11');
    const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
    expect([lock.version, lock.packages[''].version]).toEqual(['1.0.11', '1.0.11']);
    const notes = readFileSync(join(root, 'docs', 'releases', '1.0.11.md'), 'utf8');
    for (const { heading } of LANGUAGES) expect(notes).toContain(`## ${heading}`);
  });

  it('keeps notes that already exist', () => {
    const root = fakeRepo();
    writeFileSync(join(root, 'docs', 'releases', '1.0.11.md'), 'already written');
    expect(bump(root, '1.0.11').created).toBe(false);
    expect(readFileSync(join(root, 'docs', 'releases', '1.0.11.md'), 'utf8')).toBe('already written');
  });

  it('refuses a version that is not newer, or not a version', () => {
    const root = fakeRepo();
    expect(() => bump(root, '1.0.10')).toThrow('not newer');
    expect(() => bump(root, '1.0.9')).toThrow('not newer');
    expect(() => bump(root, 'v1.0.11')).toThrow('not a version');
  });
});

describe('release notes', () => {
  it('reads each language and ignores the instructions', () => {
    const sections = readNotes(filledNotes('1.0.11', 'Faster imports.'));
    expect(sections).toEqual({ en: 'Faster imports.', he: 'Faster imports.', ar: 'Faster imports.', es: 'Faster imports.', ru: 'Faster imports.' });
  });

  it('flags an empty template, and text over the Play limit', () => {
    expect(notesProblems(notesTemplate('1.0.11'))).toHaveLength(LANGUAGES.length);
    expect(notesProblems(filledNotes('1.0.11', 'x'.repeat(501)))[0]).toContain('501 characters');
    expect(notesProblems(filledNotes('1.0.11', 'ש'.repeat(500)))).toEqual([]);
  });
});

describe('checkTag', () => {
  it('passes when the files match the tag and the notes are filled in', () => {
    const root = fakeRepo('1.0.11');
    writeFileSync(join(root, 'docs', 'releases', '1.0.11.md'), filledNotes('1.0.11'));
    expect(checkTag(root, 'v1.0.11')).toEqual([]);
  });

  it('names every file that does not match', () => {
    const root = fakeRepo('1.0.11');
    writeFileSync(join(root, 'docs', 'releases', '1.0.12.md'), filledNotes('1.0.12'));
    const problems = checkTag(root, 'v1.0.12');
    expect(problems).toHaveLength(4);
    expect(problems[0]).toBe('app.json says 1.0.11, but the tag is v1.0.12.');
  });

  it('stops when the notes are missing or empty', () => {
    const root = fakeRepo('1.0.11');
    expect(checkTag(root, 'v1.0.11')).toEqual([
      'docs/releases/1.0.11.md is missing. Run npm run release:bump 1.0.11.',
    ]);
    writeFileSync(join(root, 'docs', 'releases', '1.0.11.md'), notesTemplate('1.0.11'));
    expect(checkTag(root, 'v1.0.11')).toHaveLength(LANGUAGES.length);
  });

  it('refuses tags that are not release tags', () => {
    const root = fakeRepo();
    expect(checkTag(root, '1.0.10')[0]).toContain('not a release tag');
    expect(checkTag(root, 'v1.0')[0]).toContain('not a release tag');
  });
});
