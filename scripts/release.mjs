#!/usr/bin/env node
// Store releases (ADR 030, docs/RELEASING.md).
//
//   npm run release:bump 1.0.11     Sets the version in app.json, package.json and package-lock.json,
//                                   and creates docs/releases/1.0.11.md for the What's New text.
//   node scripts/release.mjs check v1.0.11
//                                   What the release workflow runs before it builds: the tag matches
//                                   the version files, and the release notes are filled in.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The store languages, in the order they appear in the notes file. */
export const LANGUAGES = [
  { code: 'en', heading: 'English (en)' },
  { code: 'he', heading: 'עברית (he)' },
  { code: 'ar', heading: 'العربية (ar)' },
  { code: 'es', heading: 'Español (es)' },
  { code: 'ru', heading: 'Русский (ru)' },
];

/** Google Play's limit for "What's new" in each language. The App Store allows more. */
export const STORE_NOTES_LIMIT = 500;

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseVersion(version) {
  const match = VERSION.exec(version ?? '');
  return match ? match.slice(1).map(Number) : null;
}

export function isNewer(next, current) {
  const a = parseVersion(next);
  const b = parseVersion(current);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

export function notesPath(root, version) {
  return join(root, 'docs', 'releases', `${version}.md`);
}

export function notesTemplate(version) {
  const languages = LANGUAGES.map(({ heading }) => `## ${heading}\n\n`).join('');
  return `# Pinch ${version}

<!--
What's New for the App Store and Google Play, one section per language.
Lead with what people get (saving money, saving time, easier to use), not technical features.
One line per change, as a plain fact with numbers and names: "Pinch now imports recipes from
Pinterest", not "improvements" or "bug fixes". AI assistants read and repeat these. No jokes.
At most ${STORE_NOTES_LIMIT} characters per language (Google Play's limit). Paste each one into
App Store Connect and Play Console when you promote the build.
-->

${languages}## What changed (for us)

<!-- The PRs in this release, for the team. Not shown in the stores. -->
`;
}

/** The text under each language heading, without HTML comments. */
export function readNotes(markdown) {
  const text = markdown.replace(/<!--[\s\S]*?-->/g, '');
  const sections = {};
  for (const { code, heading } of LANGUAGES) {
    const start = text.indexOf(`## ${heading}`);
    if (start === -1) {
      sections[code] = null;
      continue;
    }
    const body = text.slice(start + heading.length + 3);
    const end = body.search(/^## /m);
    sections[code] = (end === -1 ? body : body.slice(0, end)).trim();
  }
  return sections;
}

/** Problems with a release notes file, as sentences. Empty when it's ready. */
export function notesProblems(markdown) {
  const problems = [];
  const sections = readNotes(markdown);
  for (const { code, heading } of LANGUAGES) {
    const body = sections[code];
    if (body === null) problems.push(`The "## ${heading}" section is missing.`);
    else if (!body) problems.push(`The ${heading} What's New is empty.`);
    else if ([...body].length > STORE_NOTES_LIMIT)
      problems.push(
        `The ${heading} What's New is ${[...body].length} characters. Google Play allows ${STORE_NOTES_LIMIT}.`,
      );
  }
  return problems;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** The app version in each file that holds one. */
export function versionsIn(root) {
  const lock = readJson(join(root, 'package-lock.json'));
  return {
    'app.json': readJson(join(root, 'app.json')).expo.version,
    'package.json': readJson(join(root, 'package.json')).version,
    'package-lock.json': lock.version,
    'package-lock.json (packages[""])': lock.packages?.['']?.version,
  };
}

export function bump(root, version) {
  if (!parseVersion(version)) throw new Error(`"${version}" is not a version like 1.0.11.`);
  const current = versionsIn(root)['app.json'];
  if (!isNewer(version, current)) throw new Error(`${version} is not newer than the current ${current}.`);

  const appPath = join(root, 'app.json');
  const app = readJson(appPath);
  app.expo.version = version;
  writeJson(appPath, app);

  const pkgPath = join(root, 'package.json');
  const pkg = readJson(pkgPath);
  pkg.version = version;
  writeJson(pkgPath, pkg);

  const lockPath = join(root, 'package-lock.json');
  const lock = readJson(lockPath);
  lock.version = version;
  if (lock.packages?.['']) lock.packages[''].version = version;
  writeJson(lockPath, lock);

  const notes = notesPath(root, version);
  const created = !existsSync(notes);
  if (created) {
    mkdirSync(dirname(notes), { recursive: true });
    writeFileSync(notes, notesTemplate(version));
  }
  return { from: current, notes, created };
}

/** Problems that should stop a release build for this tag, as sentences. Empty when it can go. */
export function checkTag(root, tag) {
  const version = tag?.replace(/^v/, '');
  if (!tag?.startsWith('v') || !parseVersion(version))
    return [`The tag "${tag}" is not a release tag like v1.0.11.`];

  const problems = [];
  for (const [file, found] of Object.entries(versionsIn(root))) {
    if (found !== version) problems.push(`${file} says ${found}, but the tag is ${tag}.`);
  }
  const notes = notesPath(root, version);
  if (!existsSync(notes)) problems.push(`docs/releases/${version}.md is missing. Run npm run release:bump ${version}.`);
  else problems.push(...notesProblems(readFileSync(notes, 'utf8')).map((p) => `docs/releases/${version}.md: ${p}`));
  return problems;
}

function main([command, arg]) {
  if (command === 'bump') {
    const { from, created } = bump(ROOT, arg);
    console.log(`Version ${from} → ${arg} in app.json, package.json and package-lock.json.`);
    console.log(
      created
        ? `Created docs/releases/${arg}.md. Fill in What's New in every language, then open the version PR.`
        : `docs/releases/${arg}.md already exists, left as it is.`,
    );
    return 0;
  }
  if (command === 'check') {
    const problems = checkTag(ROOT, arg);
    if (problems.length) {
      console.error(`Not releasing ${arg}:`);
      for (const problem of problems) console.error(`- ${problem}`);
      return 1;
    }
    console.log(`${arg} matches the version files and its release notes are filled in.`);
    return 0;
  }
  console.error('Usage: npm run release:bump <version>   or   node scripts/release.mjs check <tag>');
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
