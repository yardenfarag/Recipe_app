// Gives every web JS file a name that changes whenever its contents change.
//
// `expo export -p web` can keep a file's name across builds while its contents change: the
// entry file kept the name entry-7bf3b… through two deploys that changed the route chunks
// it loads. A browser holding the cached old entry then mixed it with the new chunks and
// crashed with "Requiring unknown module" (2026-11-18). Browsers cache these files for
// 10 minutes on GitHub Pages, so every web deploy broke the app for anyone who had it open.
//
// After the export, this renames each file to `<name>-<md5 of its final contents>.js` and
// rewrites every reference to it. Files are renamed after the files they reference, so a
// file's hash covers the names of everything it loads.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const HASHED_NAME = /^(.+)-[0-9a-f]{32}\.js$/;

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

const md5 = (text) => createHash('md5').update(text).digest('hex');

/**
 * @param {string} appDir the `expo export` output directory (dist/app)
 * @returns {Record<string, string>} old file name → new file name, for files that changed name
 */
export function contentHashWebChunks(appDir) {
  const jsDir = join(appDir, '_expo', 'static', 'js', 'web');
  const all = filesUnder(appDir);
  const textFiles = all.filter((file) => /\.(js|html|json|css|map)$/.test(file));
  const contents = new Map(textFiles.map((file) => [file, readFileSync(file, 'utf8')]));

  /** name → path, for the JS files we rename */
  const chunks = new Map(
    readdirSync(jsDir)
      .filter((name) => HASHED_NAME.test(name))
      .map((name) => [name, join(jsDir, name)]),
  );

  const renamed = {};
  const done = new Set();
  const referencesOf = (name) =>
    [...chunks.keys()].filter((other) => other !== name && contents.get(chunks.get(name)).includes(other));

  while (done.size < chunks.size) {
    const pending = [...chunks.keys()].filter((name) => !done.has(name));
    // Leaves first; if what's left references itself in a loop, take it anyway.
    const ready = pending.filter((name) => referencesOf(name).every((ref) => done.has(ref)));
    const batch = ready.length ? ready : pending;

    for (const name of batch) {
      const path = chunks.get(name);
      const base = HASHED_NAME.exec(name)[1];
      const nextName = `${base}-${md5(contents.get(path))}.js`;
      done.add(name);
      if (nextName === name) continue;

      const nextPath = join(jsDir, nextName);
      renameSync(path, nextPath);
      contents.set(nextPath, contents.get(path));
      contents.delete(path);
      chunks.delete(name);
      chunks.set(nextName, nextPath);
      done.delete(name);
      done.add(nextName);
      renamed[name] = nextName;

      for (const [file, text] of contents) {
        if (text.includes(name)) contents.set(file, text.split(name).join(nextName));
      }
    }
  }

  for (const [file, text] of contents) {
    if (text !== readFileSyncSafe(file)) writeFileSync(file, text);
  }
  return renamed;
}

function readFileSyncSafe(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}
