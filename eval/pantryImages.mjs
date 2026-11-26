// PIN-181 pantry eval: prepares the photos the way the apps will send them.
//   node eval/pantryImages.mjs
// Reads eval/private/pantry/<file> for every case in eval/cases/pantry.json and writes
// eval/private/pantry/prepared/<id>@<size>.jpg. Commons cases are downloaded first. Cases with `degrade`
// are made from another case's photo (a blurred or darkened copy), so the "retake" verdicts have a known answer.
//
// Node, not Deno: resizing needs sharp, which the web app already installs (run `npm ci` in web/ first).

import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(join(here, '../web/package.json'))('sharp');

/** Long edge in pixels and JPEG quality. `small` is close to what Snap and fridge match send today. */
export const SIZES = { large: { edge: 2048, quality: 80 }, small: { edge: 1280, quality: 60 } };

const UA = 'PinchEval/0.1 (https://pinch-app.io; eval of recipe models)';
const dir = join(here, 'private/pantry');
const out = join(dir, 'prepared');
mkdirSync(out, { recursive: true });

const { cases } = JSON.parse(readFileSync(join(here, 'cases/pantry.json'), 'utf8'));
const byId = new Map(cases.map((c) => [c.id, c]));

async function commonsFile(testCase) {
  const path = join(dir, `${testCase.id}.jpg`);
  if (existsSync(path)) return path;
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    prop: 'imageinfo',
    iiprop: 'url',
    iiurlwidth: '2048',
    titles: testCase.commons,
  }).toString();
  const data = await (await fetch(url, { headers: { 'User-Agent': UA } })).json();
  const info = Object.values(data.query.pages)[0]?.imageinfo?.[0];
  if (!info) throw new Error(`No Commons image for ${testCase.commons}`);
  const res = await fetch(info.thumburl ?? info.url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`download ${res.status} for ${testCase.commons}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  return path;
}

async function sourceFor(testCase) {
  if (testCase.degrade) return sourceFor(byId.get(testCase.degrade.from));
  if (testCase.commons) return commonsFile(testCase);
  return join(dir, testCase.file);
}

for (const testCase of cases) {
  try {
    const source = await sourceFor(testCase);
    for (const [name, size] of Object.entries(SIZES)) {
      let image = sharp(source)
        .rotate()
        .resize({ width: size.edge, height: size.edge, fit: 'inside', withoutEnlargement: true });
      // A shaky hand: the blur is set on the resized image, so both sizes are equally unreadable.
      if (testCase.degrade?.how === 'blur') image = image.blur(size.edge / 110);
      // A fridge with the light off: about an eighth of the brightness.
      if (testCase.degrade?.how === 'dark') image = image.linear(0.12, 0);
      await image.jpeg({ quality: size.quality }).toFile(join(out, `${testCase.id}@${name}.jpg`));
    }
    console.log(`✓ ${testCase.id}`);
  } catch (error) {
    console.error(`✗ ${testCase.id}: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
