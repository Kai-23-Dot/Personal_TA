import { describe, expect, test } from "vitest";
import { assertPublicUrl, extractReadableText, WebPageError } from "./fetchWebPage";

describe("assertPublicUrl", () => {
  test("accepts ordinary public pages", () => {
    expect(assertPublicUrl("https://en.wikipedia.org/wiki/Mitosis").hostname).toBe(
      "en.wikipedia.org"
    );
    expect(assertPublicUrl("http://example.com/a/b?c=d").protocol).toBe("http:");
  });

  test("refuses anything that is not http(s)", () => {
    // file: would read the server's disk; the others are not fetchable content.
    for (const url of [
      "file:///etc/passwd",
      "ftp://example.com/x",
      "data:text/html,<h1>hi</h1>",
      "javascript:alert(1)",
    ]) {
      expect(() => assertPublicUrl(url), url).toThrow(WebPageError);
    }
  });

  test("refuses addresses inside the deployment's own network", () => {
    // This is the SSRF guard. 169.254.169.254 is the cloud metadata endpoint on
    // every major provider; the rest are private ranges where a student could
    // otherwise reach internal services and read the response out of a note.
    for (const host of [
      "http://localhost/",
      "http://127.0.0.1/",
      "http://0.0.0.0/",
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.5/",
      "http://192.168.1.1/",
      "http://172.16.0.1/",
      "http://172.31.255.254/",
      "http://db.internal/",
      "http://service.local/",
      "http://[::1]/",
    ]) {
      expect(() => assertPublicUrl(host), host).toThrow(WebPageError);
    }
  });

  test("does not mistake public addresses for private ones", () => {
    // 172.32 is outside the private 172.16–172.31 block, and a hostname merely
    // containing "local" is not a local address.
    expect(() => assertPublicUrl("http://172.32.0.1/")).not.toThrow();
    expect(() => assertPublicUrl("https://localhost.example.com/")).not.toThrow();
  });

  test("rejects input that is not a URL at all", () => {
    expect(() => assertPublicUrl("just some words")).toThrow(WebPageError);
  });
});

describe("extractReadableText", () => {
  test("keeps the article and drops the chrome", () => {
    const page = extractReadableText(`
      <html><head><title>Cell division</title></head>
      <body>
        <nav><a href="/">Home</a><a href="/about">About</a></nav>
        <script>tracker.init()</script>
        <style>.x{color:red}</style>
        <article><h1>Mitosis</h1><p>One cell becomes two.</p><p>It has four phases.</p></article>
        <footer>© 2026</footer>
      </body></html>
    `);

    expect(page.title).toBe("Cell division");
    expect(page.text).toContain("Mitosis");
    expect(page.text).toContain("One cell becomes two.");
    // Script bodies, styles and navigation would otherwise be studied as if
    // they were course material.
    expect(page.text).not.toContain("tracker.init");
    expect(page.text).not.toContain("color:red");
    expect(page.text).not.toContain("About");
  });

  test("keeps paragraphs apart rather than running them together", () => {
    const page = extractReadableText("<p>First point.</p><p>Second point.</p>");
    expect(page.text).toBe("First point.\nSecond point.");
  });

  test("decodes entities so the text reads normally", () => {
    const page = extractReadableText("<p>Ribosomes &amp; enzymes &mdash; &quot;the workers&quot;</p>");
    expect(page.text).toContain("Ribosomes & enzymes");
    expect(page.text).toContain('"the workers"');
  });

  test("reports no text rather than whitespace for an empty page", () => {
    expect(extractReadableText("<html><body><script>x()</script></body></html>").text).toBe("");
  });
});
