import { describe, expect, it } from "vitest";

import { activeStepAt, listeningMessage, readPlayerMessage, seekMessages } from "@/lib/cook/playerMessages";

const YT = "https://www.youtube.com";
const TT = "https://www.tiktok.com";

describe("readPlayerMessage", () => {
  it("reads YouTube's ready and time messages", () => {
    expect(readPlayerMessage("youtube", YT, JSON.stringify({ event: "onReady" }))).toEqual({ kind: "ready" });
    expect(readPlayerMessage("youtube", YT, JSON.stringify({ event: "infoDelivery", info: { currentTime: 42.5 } }))).toEqual({
      kind: "time",
      seconds: 42.5,
    });
    expect(readPlayerMessage("youtube", YT, JSON.stringify({ event: "infoDelivery", info: { volume: 50 } }))).toEqual({ kind: "ready" });
  });

  it("ignores messages from other origins, and junk", () => {
    expect(readPlayerMessage("youtube", "https://evil.example", JSON.stringify({ event: "onReady" }))).toBeNull();
    expect(readPlayerMessage("youtube", YT, "not json")).toBeNull();
    expect(readPlayerMessage("youtube", YT, JSON.stringify({ event: "somethingElse" }))).toBeNull();
    expect(readPlayerMessage("instagram", "https://www.instagram.com", { anything: true })).toBeNull();
  });

  it("reads TikTok's ready and time messages, only when marked as the player's", () => {
    expect(readPlayerMessage("tiktok", TT, { type: "onPlayerReady", "x-tiktok-player": true })).toEqual({ kind: "ready" });
    expect(
      readPlayerMessage("tiktok", TT, { type: "onCurrentTime", value: { currentTime: 12, duration: 60 }, "x-tiktok-player": true }),
    ).toEqual({ kind: "time", seconds: 12 });
    expect(readPlayerMessage("tiktok", TT, JSON.stringify({ type: "onPlayerReady", "x-tiktok-player": true }))).toEqual({ kind: "ready" });
    expect(readPlayerMessage("tiktok", TT, { type: "onPlayerReady" })).toBeNull();
  });
});

describe("messages to the players", () => {
  it("tells YouTube we are listening, and seeks then plays", () => {
    expect(JSON.parse(listeningMessage("youtube") as string)).toMatchObject({ event: "listening" });
    expect(listeningMessage("tiktok")).toBeNull();
    const [seek, play] = seekMessages("youtube", 83.6).map((message) => JSON.parse(message as string));
    expect(seek).toMatchObject({ event: "command", func: "seekTo", args: [84, true] });
    expect(play).toMatchObject({ event: "command", func: "playVideo" });
  });

  it("seeks TikTok with its own message shape", () => {
    expect(seekMessages("tiktok", 30)).toEqual([
      { type: "seekTo", value: 30, "x-tiktok-player": true },
      { type: "play", "x-tiktok-player": true },
    ]);
  });

  it("has nothing to say to Instagram or Facebook", () => {
    expect(seekMessages("instagram", 30)).toEqual([]);
    expect(seekMessages("facebook", 30)).toEqual([]);
  });
});

describe("activeStepAt", () => {
  const steps = [
    { step: 1, timestamp_seconds: 10 },
    { step: 2 },
    { step: 3, timestamp_seconds: 45 },
    { step: 4, timestamp_seconds: 90 },
  ];

  it("is the last step whose time has come", () => {
    expect(activeStepAt(steps, 0)).toBeNull();
    expect(activeStepAt(steps, 10)).toBe(1);
    expect(activeStepAt(steps, 44)).toBe(1);
    expect(activeStepAt(steps, 44.6)).toBe(3);
    expect(activeStepAt(steps, 600)).toBe(4);
  });

  it("is null when no step has a time", () => {
    expect(activeStepAt([{ step: 1 }, { step: 2 }], 30)).toBeNull();
  });
});
