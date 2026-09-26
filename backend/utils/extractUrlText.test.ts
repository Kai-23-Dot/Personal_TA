import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), pdf: vi.fn(), youtube: vi.fn() }));
vi.mock("@/backend/security/publicUrl", () => ({ fetchPublicResource: mocks.fetch }));
vi.mock("./extractFileText", () => ({ extractFileText: mocks.pdf }));
vi.mock("./extractYoutubeText", async (importOriginal) => ({
  ...await importOriginal<typeof import("./extractYoutubeText")>(),
  extractYoutubeText: mocks.youtube,
}));

import { extractUrlText } from "./extractUrlText";
import { extractWebsiteText } from "./extractWebsiteText";

describe("public source extraction", () => {
  beforeEach(() => vi.resetAllMocks());

  it("extracts article text and entities without scripts, navigation or hidden content", async () => {
    mocks.fetch.mockResolvedValue({ url: "https://example.com/lesson", contentType: "text/html; charset=utf-8", buffer: Buffer.from(`
      <html><head><title>Biology &amp; Chemistry</title></head><body>
      <nav>Log in</nav><main><h1>Photosynthesis</h1><p>Plants use <b>light</b> &amp; CO&#8322;.</p>
      <p>Energy &ne; mass.</p><script>secret()</script><style>.foo{}</style>
      <div hidden>Do not include</div><div aria-hidden="true">Also hidden</div></main>
      <footer>Cookie preferences</footer></body></html>`),
    });
    const result = await extractUrlText("https://example.com/lesson");
    expect(result).toMatchObject({ sourceType: "website", title: "Biology & Chemistry", text: "Photosynthesis\n\nPlants use light & CO₂.\n\nEnergy ≠ mass." });
  });

  it("handles malformed HTML and body-only pages without dropping readable text", () => {
    expect(extractWebsiteText("<body><p>Homeostasis regulates the body.<p>Second paragraph").text)
      .toBe("Homeostasis regulates the body.\n\nSecond paragraph");
    expect(extractWebsiteText("<main><script>render()</script></main><article><p>Readable fallback</p></article>").text)
      .toBe("Readable fallback");
  });

  it("does not misclassify an article discussing PDF headers", async () => {
    mocks.fetch.mockResolvedValue({ url: "https://example.com/pdf-format", contentType: "text/html", buffer: Buffer.from("<main><p>PDF files start with %PDF-1.7</p></main>") });
    await expect(extractUrlText("https://example.com/pdf-format")).resolves.toMatchObject({ sourceType: "website", text: "PDF files start with %PDF-1.7" });
    expect(mocks.pdf).not.toHaveBeenCalled();
  });

  it("reuses the PDF parser for links even when the server sends octet-stream", async () => {
    const buffer = Buffer.from("%PDF-1.7\nfixture");
    mocks.fetch.mockResolvedValue({ url: "https://example.com/download", contentType: "application/octet-stream", buffer });
    mocks.pdf.mockResolvedValue("The cell is the basic unit of life.");
    await expect(extractUrlText("https://example.com/download")).resolves.toMatchObject({ sourceType: "pdf", text: "The cell is the basic unit of life." });
    expect(mocks.pdf).toHaveBeenCalledWith(buffer, "pdf");
  });

  it("reports unreadable PDFs instead of indexing empty content", async () => {
    mocks.fetch.mockResolvedValue({ url: "https://example.com/scan.pdf", contentType: "application/pdf", buffer: Buffer.from("%PDF-1.7") });
    mocks.pdf.mockResolvedValue(null);
    await expect(extractUrlText("https://example.com/scan.pdf")).rejects.toThrow("Scanned PDFs require OCR");
  });

  it("uses captions for YouTube links, including redirects to a watch page", async () => {
    const url = "https://www.youtube.com/watch?v=abcdefghijk";
    mocks.youtube.mockResolvedValue({ text: "A real transcript", title: "Lesson", language: "en" });
    await expect(extractUrlText(url)).resolves.toMatchObject({ sourceType: "youtube", text: "A real transcript" });
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.fetch.mockResolvedValue({ url, contentType: "text/html", buffer: Buffer.from("watch page") });
    await expect(extractUrlText("https://example.com/short")).resolves.toMatchObject({ sourceType: "youtube", sourceUrl: url });
  });

  it("rejects binary responses and pages with no readable content", async () => {
    mocks.fetch.mockResolvedValue({ url: "https://example.com/video", contentType: "video/mp4", buffer: Buffer.from("binary") });
    await expect(extractUrlText("https://example.com/video")).rejects.toThrow("Unsupported website content type");
    expect(() => extractWebsiteText("<script>renderApp()</script>")).toThrow("no readable text");
    expect(() => extractWebsiteText("<html><head><title>Loading lesson</title></head><body><main><script>renderApp()</script></main></body></html>"))
      .toThrow("no readable text");
  });

  it("honors response charset and rejects oversized HTML", async () => {
    mocks.fetch.mockResolvedValue({ url: "https://example.com/text", contentType: "text/plain; charset=windows-1252", buffer: Buffer.from([0x63, 0x61, 0x66, 0xe9]) });
    await expect(extractUrlText("https://example.com/text")).resolves.toMatchObject({ text: "café" });
    mocks.fetch.mockResolvedValue({ url: "https://example.com/big", contentType: "text/html", buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
    await expect(extractUrlText("https://example.com/big")).rejects.toThrow("5 MB");
  });
});
