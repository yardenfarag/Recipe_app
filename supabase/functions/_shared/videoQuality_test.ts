// npx deno test -A --no-lock supabase/functions/_shared/videoQuality_test.ts

import { assertEquals } from 'jsr:@std/assert@1';

import { extractInstagramVideoUrl, pickSmallestInstagramVideo } from './instagram.ts';
import {
  pickSmallestTikTokVideo,
  resolveTikTokVideoUrl,
  type TikTokAwemeDetail,
  type TikTokVideoResponse,
} from './tiktok.ts';
import {
  formatMaxVideoDurationLabel,
  isVideoTooLong,
  MAX_VIDEO_DURATION_SECONDS,
  wantsSmallestVideo,
} from './videoLimits.ts';

Deno.test('videos up to 12 minutes go to the model; longer ones do not', () => {
  assertEquals(MAX_VIDEO_DURATION_SECONDS, 12 * 60);
  assertEquals(isVideoTooLong(11 * 60 + 59), false);
  assertEquals(isVideoTooLong(12 * 60), false);
  assertEquals(isVideoTooLong(12 * 60 + 1), true);
  assertEquals(isVideoTooLong(undefined), false);
  assertEquals(formatMaxVideoDurationLabel(), '12 minutes');
});

Deno.test('only videos over 3 minutes switch to the smallest quality', () => {
  assertEquals(wantsSmallestVideo(180), false);
  assertEquals(wantsSmallestVideo(181), true);
  assertEquals(wantsSmallestVideo(undefined), false);
  assertEquals(wantsSmallestVideo(Number.NaN), false);
});

const tikTokBitRates = [
  { gear_name: 'normal_1080_0', bit_rate: 2_400_000, play_addr: { url_list: ['https://v.tt/1080'], data_size: 95_000_000 } },
  { gear_name: 'normal_540_0', bit_rate: 600_000, play_addr: { url_list: ['https://v.tt/540'], data_size: '18000000' } },
  { gear_name: 'normal_720_0', bit_rate: 1_100_000, play_addr: { url_list: ['https://v.tt/720'], data_size: 40_000_000 } },
  { gear_name: 'broken', bit_rate: 100_000, play_addr: { url_list: [] } },
];

Deno.test('TikTok: picks the smallest quality by file size, skipping entries without a URL', () => {
  assertEquals(pickSmallestTikTokVideo(tikTokBitRates), 'https://v.tt/540');
  assertEquals(pickSmallestTikTokVideo([]), undefined);
  assertEquals(pickSmallestTikTokVideo(undefined), undefined);
});

Deno.test('TikTok: falls back to bit rate when file sizes are missing', () => {
  const noSizes = [
    { bit_rate: 2_000_000, play_addr: { url_list: ['https://v.tt/high'] } },
    { bit_rate: 500_000, play_addr: { url_list: ['https://v.tt/low'] } },
  ];
  assertEquals(pickSmallestTikTokVideo(noSizes), 'https://v.tt/low');
});

Deno.test('TikTok: long videos use the smallest quality, short ones keep the no-watermark copy', () => {
  const response: TikTokVideoResponse = { no_watermark_video_url: 'https://v.tt/no-watermark' };
  const detail: TikTokAwemeDetail = { video: { bit_rate: tikTokBitRates } };
  assertEquals(resolveTikTokVideoUrl(response, detail, 9 * 60), 'https://v.tt/540');
  assertEquals(resolveTikTokVideoUrl(response, detail, 60), 'https://v.tt/no-watermark');
  // A long video without quality options still gets a URL.
  assertEquals(resolveTikTokVideoUrl(response, { video: {} }, 9 * 60), 'https://v.tt/no-watermark');
});

const instagramMedia = {
  video_url: 'https://cdn.ig/default.mp4',
  video_versions: [
    { width: 1080, height: 1920, url: 'https://cdn.ig/1080.mp4' },
    { width: 480, height: 854, url: 'https://cdn.ig/480.mp4' },
    { width: 720, height: 1280, url: 'https://cdn.ig/720.mp4' },
  ],
};

Deno.test('Instagram: picks the lowest-resolution version', () => {
  assertEquals(pickSmallestInstagramVideo(instagramMedia.video_versions), 'https://cdn.ig/480.mp4');
  assertEquals(pickSmallestInstagramVideo([{ url: 'https://cdn.ig/only.mp4' }]), 'https://cdn.ig/only.mp4');
  assertEquals(pickSmallestInstagramVideo('not a list'), undefined);
});

Deno.test('Instagram: long videos use the smallest version, short ones keep the default URL', () => {
  assertEquals(extractInstagramVideoUrl(instagramMedia, 8 * 60), 'https://cdn.ig/480.mp4');
  assertEquals(extractInstagramVideoUrl(instagramMedia, 90), 'https://cdn.ig/default.mp4');
  assertEquals(extractInstagramVideoUrl(instagramMedia), 'https://cdn.ig/default.mp4');
  assertEquals(extractInstagramVideoUrl({ video_url: 'https://cdn.ig/default.mp4' }, 8 * 60), 'https://cdn.ig/default.mp4');
});
