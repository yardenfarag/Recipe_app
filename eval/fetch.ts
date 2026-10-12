// Snapshot eval inputs: post text through the production fetchers, post videos,
// and Wikimedia Commons images. Everything lands in eval/private/ (gitignored).

import { detectPlatform } from '../supabase/functions/_shared/platform.ts';
import type { PlatformMeta } from '../supabase/functions/_shared/platformMeta.ts';
import {
  fetchInstagramMeta,
  isInstagramCdnUrl,
  resolveInstagramVideoForGemini,
} from '../supabase/functions/_shared/instagram.ts';
import { fetchTikTokMeta } from '../supabase/functions/_shared/tiktok.ts';
import { fetchWebRecipeMeta } from '../supabase/functions/_shared/webRecipe.ts';
import { fetchYouTubeMeta } from '../supabase/functions/_shared/youtube.ts';
import { exists, pool, PRIVATE, readJson, ROOT, writeJson } from './lib.ts';

export type PostCase = { id: string; url: string; tasks?: string[] };
export type PostSnapshot = { id: string; url: string; platform: string; fetchedAt: string; meta: PlatformMeta };

export type ImageCase = {
  id: string;
  /** Commons file title ("File:…"). Filled from `query` on first fetch. */
  title?: string;
  query?: string;
  use: 'photo' | 'gate' | 'invent';
  /** Content gate ground truth. */
  food?: boolean;
  handwritten?: boolean;
  license?: string;
};

const UA = 'PinchEval/0.1 (https://pinch-app.io; eval of recipe models)';

export const postPath = (id: string) => `${PRIVATE}posts/${id}.json`;
export const videoPath = (id: string) => `${PRIVATE}videos/${id}.mp4`;
export const imagePath = (id: string) => `${PRIVATE}images/${id}.jpg`;

async function fetchMeta(url: string): Promise<{ platform: string; meta: PlatformMeta }> {
  const platform = detectPlatform(url);
  switch (platform) {
    case 'instagram':
      return { platform, meta: await fetchInstagramMeta(url) };
    case 'tiktok':
      return { platform, meta: await fetchTikTokMeta(url) };
    case 'web':
      return { platform, meta: await fetchWebRecipeMeta(url) };
    case 'youtube': {
      const id = url.match(/(?:v=|shorts\/|youtu\.be\/)([\w-]{11})/)?.[1];
      if (!id) throw new Error(`No YouTube id in ${url}`);
      return { platform, meta: await fetchYouTubeMeta(id) };
    }
    default:
      throw new Error(`Unsupported platform for ${url}`);
  }
}

async function download(url: string, path: string): Promise<number> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`download ${res.status} for ${new URL(url).host}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  await Deno.mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  await Deno.writeFile(path, bytes);
  return bytes.length;
}

async function fetchPosts(force: boolean) {
  const posts = await readJson<PostCase[]>(`${ROOT}cases/posts.json`);
  await pool(posts, 4, async (post) => {
    let snap: PostSnapshot | null = null;
    if (!force && (await exists(postPath(post.id)))) {
      snap = await readJson<PostSnapshot>(postPath(post.id));
    } else {
      try {
        const { platform, meta } = await fetchMeta(post.url);
        snap = { id: post.id, url: post.url, platform, fetchedAt: new Date().toISOString(), meta };
        await writeJson(postPath(post.id), snap);
      } catch (err) {
        console.error(`✗ ${post.id}: ${err instanceof Error ? err.message : err}`);
        return;
      }
    }
    const m = snap.meta;
    let video = '';
    if (m.videoUrl && snap.platform !== 'web' && !(await exists(videoPath(post.id)))) {
      try {
        let url = m.videoUrl;
        let bytes = 0;
        try {
          bytes = await download(url, videoPath(post.id));
        } catch (err) {
          if (snap.platform !== 'instagram' || !isInstagramCdnUrl(url)) throw err;
          url = (await resolveInstagramVideoForGemini(post.url)) ?? '';
          if (!url) throw err;
          bytes = await download(url, videoPath(post.id));
        }
        video = ` video ${(bytes / 1e6).toFixed(1)}MB`;
      } catch (err) {
        video = ` video ✗ (${err instanceof Error ? err.message : err})`;
      }
    } else if (await exists(videoPath(post.id))) {
      video = ' video cached';
    }
    console.log(
      `✓ ${post.id}: desc ${m.description?.length ?? 0} chars, ${m.topComments.length} comments, ` +
        `captions ${m.captions?.length ?? 0}, ${m.durationSeconds ?? '?'}s${video}`,
    );
  });
}

async function commonsSearch(query: string): Promise<string | undefined> {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    list: 'search',
    srnamespace: '6',
    srlimit: '10',
    srsearch: `${query} filetype:bitmap`,
  }).toString();
  const data = await (await fetch(url, { headers: { 'User-Agent': UA } })).json();
  return data.query?.search?.find((r: { title: string }) => /\.(jpe?g|png)$/i.test(r.title))?.title;
}

async function commonsImage(title: string): Promise<{ url: string; license: string }> {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: '1280',
    titles: title,
  }).toString();
  const data = await (await fetch(url, { headers: { 'User-Agent': UA } })).json();
  const info = (Object.values(data.query.pages)[0] as any)?.imageinfo?.[0];
  if (!info) throw new Error(`No Commons image for ${title}`);
  return {
    url: info.thumburl ?? info.url,
    license: info.extmetadata?.LicenseShortName?.value ?? 'unknown',
  };
}

async function fetchImages() {
  const manifestPath = `${ROOT}cases/images.json`;
  const images = await readJson<ImageCase[]>(manifestPath);
  for (const img of images) {
    try {
      if (!img.title && img.query) img.title = await commonsSearch(img.query);
      if (!img.title) throw new Error(`no Commons match for "${img.query}"`);
      if (!img.license || !(await exists(imagePath(img.id)))) {
        const { url, license } = await commonsImage(img.title);
        img.license = license;
        await download(url, imagePath(img.id));
      }
      console.log(`✓ ${img.id}: ${img.title} (${img.license})`);
    } catch (err) {
      console.error(`✗ ${img.id}: ${err instanceof Error ? err.message : err}`);
    }
  }
  // Pin resolved titles so reruns use the same files.
  await writeJson(manifestPath, images);
}

export async function fetchCommand(args: string[]) {
  const force = args.includes('--force');
  if (!args.includes('--images-only')) await fetchPosts(force);
  if (!args.includes('--posts-only')) await fetchImages();
}
