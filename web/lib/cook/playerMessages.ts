import type { VideoPlatform } from "@/lib/cook/cookAlongVideo";

/**
 * Talking to the embedded players with postMessage, so a step's time can seek without reloading, and the page can
 * tell which step the video is on.
 *
 * YouTube (embed with `enablejsapi=1`): the page says it is listening, then the player sends JSON strings
 * (`onReady`, `infoDelivery` with `currentTime`) and takes commands (`seekTo`, `playVideo`).
 * TikTok (Embed Player v1, developers.tiktok.com/doc/embed-player): objects marked `x-tiktok-player`, with `type`
 * and `value` (`onPlayerReady`, `onCurrentTime`; commands `seekTo`, `play`).
 * Instagram and Facebook embeds have no such API.
 */

export type PlayerEvent = { kind: "ready" } | { kind: "time"; seconds: number };

const ORIGINS: Partial<Record<VideoPlatform, string[]>> = {
  youtube: ["https://www.youtube.com", "https://www.youtube-nocookie.com"],
  tiktok: ["https://www.tiktok.com"],
};

/** The origin to post to, or null for players without an API. */
export function playerOrigin(platform: VideoPlatform): string | null {
  return ORIGINS[platform]?.[0] ?? null;
}

function asObject(data: unknown): Record<string, unknown> | null {
  if (typeof data === "string") {
    try {
      const parsed: unknown = JSON.parse(data);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
}

function finiteSeconds(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** What a message from the player means, or null when it isn't one of ours (another frame, another origin). */
export function readPlayerMessage(platform: VideoPlatform, origin: string, data: unknown): PlayerEvent | null {
  if (!ORIGINS[platform]?.includes(origin)) return null;
  const message = asObject(data);
  if (!message) return null;

  if (platform === "youtube") {
    const info = asObject(message.info);
    const seconds = finiteSeconds(info?.currentTime);
    if ((message.event === "infoDelivery" || message.event === "initialDelivery") && seconds != null) {
      return { kind: "time", seconds };
    }
    if (message.event === "onReady" || message.event === "initialDelivery" || message.event === "infoDelivery") {
      return { kind: "ready" };
    }
    return null;
  }

  if (platform === "tiktok") {
    if (message["x-tiktok-player"] !== true) return null;
    if (message.type === "onPlayerReady") return { kind: "ready" };
    if (message.type === "onCurrentTime") {
      const seconds = finiteSeconds(asObject(message.value)?.currentTime);
      return seconds == null ? null : { kind: "time", seconds };
    }
  }
  return null;
}

/** YouTube sends nothing until the page says it is listening. Sent after the iframe loads, until it answers. */
export function listeningMessage(platform: VideoPlatform): unknown | null {
  if (platform !== "youtube") return null;
  return JSON.stringify({ event: "listening", id: 1, channel: "widget" });
}

/** The messages that jump the player to `seconds` and play from there. Empty for players without an API. */
export function seekMessages(platform: VideoPlatform, seconds: number): unknown[] {
  const to = Math.max(0, Math.round(seconds));
  if (platform === "youtube") {
    const command = (func: string, args: unknown[]) => JSON.stringify({ event: "command", func, args, id: 1, channel: "widget" });
    return [command("seekTo", [to, true]), command("playVideo", [])];
  }
  if (platform === "tiktok") {
    return [
      { type: "seekTo", value: to, "x-tiktok-player": true },
      { type: "play", "x-tiktok-player": true },
    ];
  }
  return [];
}

/**
 * The step the video is on: the last one whose time has come. Null before the first timed step, or when no step
 * has a time. A step a little ahead (half a second) already counts, so a jump to it highlights it at once.
 */
export function activeStepAt(steps: { step: number; timestamp_seconds?: number | null }[], seconds: number): number | null {
  let active: number | null = null;
  let best = -1;
  for (const step of steps) {
    const at = step.timestamp_seconds;
    if (at == null || !Number.isFinite(at)) continue;
    if (at <= seconds + 0.5 && at >= best) {
      best = at;
      active = step.step;
    }
  }
  return active;
}
