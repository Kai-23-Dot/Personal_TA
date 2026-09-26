import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPublicResource } from "@/backend/security/publicUrl";
import { extractYoutubeText, isYoutubeUrl, parseYoutubeVideoId } from "./extractYoutubeText";

vi.mock("@/backend/security/publicUrl", () => ({ fetchPublicResource: vi.fn() }));
const fetchResource = vi.mocked(fetchPublicResource);
const videoId = "abcdefgh_-1";
const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
const track = (languageCode = "en", kind?: string) => ({
  baseUrl: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${languageCode}${kind ? `&kind=${kind}` : ""}`,
  languageCode, kind,
});
const player = (tracks: unknown[] = [track()]) => ({
  playabilityStatus: { status: "OK" },
  videoDetails: { videoId, title: 'Learning {concepts} and "examples"' },
  captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks } },
});
const response = (body: string, url = videoUrl) => ({ url, contentType: "text/html", buffer: Buffer.from(body) });
function queuePlayer(data: unknown, prefix = "var ytInitialPlayerResponse = ") {
  fetchResource.mockResolvedValueOnce(response(`<script>${prefix}${JSON.stringify(data)};</script>`));
}
function queueTranscript(body: unknown, url = track().baseUrl) {
  fetchResource.mockResolvedValueOnce(response(typeof body === "string" ? body : JSON.stringify(body), url));
}

beforeEach(() => { vi.clearAllMocks(); });

describe("YouTube URL parsing", () => {
  it.each([
    videoUrl, `https://youtu.be/${videoId}?t=12`, `https://m.youtube.com/watch?v=${videoId}`,
    `https://www.youtube.com/embed/${videoId}`, `https://youtube.com/shorts/${videoId}`,
    `https://youtube.com/live/${videoId}`, `https://www.youtube-nocookie.com/embed/${videoId}`,
  ])("recognizes %s", (url) => { expect(parseYoutubeVideoId(url)).toBe(videoId); });

  it.each([
    `https://youtube.com.evil.test/watch?v=${videoId}`, `https://notyoutube.com/watch?v=${videoId}`,
    `https://youtube.com@evil.test/watch?v=${videoId}`, `https://evil.test/?v=${videoId}`,
    `https://www.youtube.com:8080/watch?v=${videoId}`, `ftp://youtube.com/watch?v=${videoId}`,
    "https://youtube.com/watch?v=too-short", `https://youtu.be/${videoId}/extra`,
  ])("rejects invalid or misleading URL %s", (url) => { expect(parseYoutubeVideoId(url)).toBeNull(); });

  it("identifies non-video YouTube pages so they cannot be ingested as article text", () => {
    expect(isYoutubeUrl("https://www.youtube.com/@example")).toBe(true);
    expect(isYoutubeUrl("https://www.youtube.com/")).toBe(true);
    expect(parseYoutubeVideoId("https://www.youtube.com/")).toBeNull();
    expect(isYoutubeUrl("https://notyoutube.com/")).toBe(false);
  });
});

describe("YouTube caption extraction", () => {
  it("extracts actual JSON3 captions and prefers manual English over auto and other languages", async () => {
    queuePlayer(player([track("fr"), track("en", "asr"), track("en-US")]));
    queueTranscript({ events: [
      { tStartMs: 0, segs: [{ utf8: "First " }, { utf8: "principle &amp; example." }] },
      { tStartMs: 1000, segs: [{ utf8: "Second principle." }] }, { wWinId: 1 },
    ] }, track("en-US").baseUrl);
    const result = await extractYoutubeText(`https://youtu.be/${videoId}`);
    expect(result).toEqual({
      text: "First principle & example.\nSecond principle.",
      title: 'Learning {concepts} and "examples"', language: "en-US",
    });
    const requestedTrack = new URL(fetchResource.mock.calls[1][0]);
    expect(requestedTrack.searchParams.get("lang")).toBe("en-US");
    expect(requestedTrack.searchParams.get("kind")).toBeNull();
    expect(requestedTrack.searchParams.get("fmt")).toBe("json3");
    expect(fetchResource.mock.calls[1][1]).toMatchObject({ maxRedirects: 0 });
  });

  it("prefers automatic English over a manual non-English transcript", async () => {
    queuePlayer(player([track("fr"), track("en", "asr")]));
    queueTranscript({ events: [{ segs: [{ utf8: "English lesson" }] }] });
    expect((await extractYoutubeText(videoUrl)).language).toBe("en");
    expect(new URL(fetchResource.mock.calls[1][0]).searchParams.get("kind")).toBe("asr");
  });

  it("reads window assignments and XML captions including escaped entities", async () => {
    queuePlayer(player([track("es")]), 'window["ytInitialPlayerResponse"] = ');
    queueTranscript('<transcript><text start="0">It&amp;#39;s &lt;b&gt;plain&lt;/b&gt; &#x1F600;</text><text start="2">Next &amp; final.</text></transcript>');
    expect((await extractYoutubeText(videoUrl)).text).toBe("It's <b>plain</b> 😀\nNext & final.");
  });

  it("reads timedtext paragraph captions with nested word segments", async () => {
    queuePlayer(player());
    queueTranscript('<timedtext><body><p t="0"><s>First </s><s>idea</s></p><p t="1">Next idea</p></body></timedtext>');
    expect((await extractYoutubeText(videoUrl)).text).toBe("First idea\nNext idea");
  });

  it("falls back to another available track when the preferred one is blocked", async () => {
    queuePlayer(player([track("en"), track("en", "asr")]));
    fetchResource.mockRejectedValueOnce(new Error("HTTP 403"));
    queueTranscript({ events: [{ segs: [{ utf8: "Available transcript" }] }] });
    expect((await extractYoutubeText(videoUrl)).text).toBe("Available transcript");
    expect(fetchResource).toHaveBeenCalledTimes(3);
  });

  it("rejects a page URL before any request", async () => {
    await expect(extractYoutubeText("https://youtube.com/")).rejects.toThrow("valid YouTube video URL");
    expect(fetchResource).not.toHaveBeenCalled();
  });

  it("does not treat a title or description as a transcript when captions are absent", async () => {
    queuePlayer({ videoDetails: { title: "Lesson", shortDescription: "Not spoken content" } });
    await expect(extractYoutubeText(videoUrl)).rejects.toThrow("does not provide publicly available captions");
    expect(fetchResource).toHaveBeenCalledTimes(1);
  });

  it.each(["LOGIN_REQUIRED", "UNPLAYABLE", "ERROR"])("rejects %s videos", async (status) => {
    queuePlayer({ ...player(), playabilityStatus: { status } });
    await expect(extractYoutubeText(videoUrl)).rejects.toThrow("unavailable or requires sign-in");
    expect(fetchResource).toHaveBeenCalledTimes(1);
  });

  it.each([
    "<html>Consent required</html>", '<script>var ytInitialPlayerResponse = {broken json};</script>',
    '<script>var ytInitialPlayerResponse = {"captions":',
  ])("rejects unreadable player responses", async (html) => {
    fetchResource.mockResolvedValueOnce(response(html));
    await expect(extractYoutubeText(videoUrl)).rejects.toThrow("public video player could not be read");
  });

  it("rejects a player response for another video", async () => {
    queuePlayer({ ...player(), videoDetails: { videoId: "different01" } });
    await expect(extractYoutubeText(videoUrl)).rejects.toThrow("different video");
  });

  it.each([
    "http://127.0.0.1/api/timedtext", "https://youtube.com.evil.test/api/timedtext",
    "https://www.youtube.com@evil.test/api/timedtext", "https://evil.test/api/timedtext",
    "https://www.youtube.com/redirect?q=https://evil.test", "https://googlevideo.com.evil.test/api/timedtext",
  ])("never fetches an untrusted caption URL %s", async (baseUrl) => {
    queuePlayer(player([{ ...track(), baseUrl }]));
    await expect(extractYoutubeText(videoUrl)).rejects.toThrow("could not be downloaded");
    expect(fetchResource).toHaveBeenCalledTimes(1);
  });

  it.each(["", "<html>Please sign in</html>", "{invalid", '{"events":[]}', '<transcript></transcript>'])(
    "rejects empty or malformed caption responses", async (body) => {
      queuePlayer(player());
      queueTranscript(body);
      await expect(extractYoutubeText(videoUrl)).rejects.toThrow("no readable transcript");
    },
  );
});
