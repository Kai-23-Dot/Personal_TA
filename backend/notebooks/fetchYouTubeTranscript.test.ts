import { describe, expect, test } from "vitest";
import { parseVideoId } from "./fetchYouTubeTranscript";

describe("parseVideoId", () => {
  test("reads every link shape YouTube hands out", () => {
    const id = "dQw4w9WgXcQ";
    for (const url of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?v=${id}`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://music.youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/v/${id}`,
      // Sharing a link from the app appends tracking and a timestamp.
      `https://youtu.be/${id}?si=abc123&t=42`,
      `https://www.youtube.com/watch?v=${id}&list=PLxyz&index=2`,
    ]) {
      expect(parseVideoId(url), url).toBe(id);
    }
  });

  test("accepts a bare id, since people paste those too", () => {
    expect(parseVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseVideoId("  dQw4w9WgXcQ  ")).toBe("dQw4w9WgXcQ");
  });

  test("returns null for anything that is not a video", () => {
    // These must fall through to the web-page importer rather than being
    // treated as a video with no captions.
    for (const url of [
      "https://en.wikipedia.org/wiki/Mitosis",
      "https://www.youtube.com/",
      "https://www.youtube.com/@channel",
      "https://vimeo.com/123456",
      "not a url",
      "",
    ]) {
      expect(parseVideoId(url), url).toBeNull();
    }
  });

  test("rejects ids that are not eleven characters", () => {
    expect(parseVideoId("https://youtu.be/tooshort")).toBeNull();
    expect(parseVideoId("https://www.youtube.com/watch?v=way_too_long_id_here")).toBeNull();
  });
});
