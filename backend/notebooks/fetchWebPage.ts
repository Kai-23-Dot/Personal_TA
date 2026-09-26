/**
 * Reading a web page the student pasted.
 *
 * Deliberately dependency-free: a readability library would give slightly
 * cleaner extraction, but this runs on a request path where the page is
 * untrusted input, and the smaller the surface the better. Stripping script,
 * style and chrome elements and then collapsing the remaining text gets close
 * enough for a study source, where the content matters and the layout does not.
 */

const FETCH_TIMEOUT_MS = 15_000;

/** A page larger than this is not a study source; it is a download. */
const MAX_BYTES = 5_000_000;

/**
 * Sent so sites return their normal page rather than a bot challenge. This is
 * an honest identification of the fetcher, not an attempt to look like a
 * browser that is not here.
 */
const USER_AGENT =
  "Mozilla/5.0 (compatible; SmartlearnBot/1.0; +https://smartlearn.app)";

export interface FetchedPage {
  title: string;
  text: string;
}

export class WebPageError extends Error {}

/**
 * Blocks addresses that resolve inside the deployment's own network.
 *
 * Without this the importer is an SSRF primitive: a student — or anyone who
 * can get a link in front of one — could point it at cloud metadata endpoints
 * or private services and read the response back out of their notebook.
 */
export function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebPageError("That does not look like a web address.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new WebPageError("Only http and https links can be imported.");
  }

  const host = url.hostname.toLowerCase();

  const isPrivate =
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    // IPv4 private and link-local ranges, including the 169.254.169.254
    // metadata address every major cloud exposes.
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    // IPv6 loopback and unique-local.
    host === "::1" ||
    host === "[::1]" ||
    /^\[?f[cd][0-9a-f]{2}:/i.test(host);

  if (isPrivate) {
    throw new WebPageError("That address is not publicly reachable.");
  }

  return url;
}

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)));
}

export function extractReadableText(html: string): FetchedPage {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim().slice(0, 200) : "";

  const text = decodeEntities(
    html
      // Elements whose contents are never page text.
      .replace(/<(script|style|noscript|svg|iframe|template)[\s\S]*?<\/\1>/gi, " ")
      // Page furniture that would otherwise bury the article in menu links.
      .replace(/<(nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      // Keep block boundaries as line breaks so paragraphs survive.
      .replace(/<\/(p|div|section|article|li|h[1-6]|tr|blockquote)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();

  return { title, text };
}

export async function fetchWebPage(rawUrl: string): Promise<FetchedPage> {
  const url = assertPublicUrl(rawUrl);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });
  } catch {
    throw new WebPageError("That page could not be reached.");
  }

  if (!response.ok) {
    throw new WebPageError(`That page returned ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!/text\/html|application\/xhtml|text\/plain/i.test(contentType)) {
    throw new WebPageError(
      "That link is not a web page. Upload it as a file instead."
    );
  }

  const size = Number(response.headers.get("content-length") ?? 0);
  if (size > MAX_BYTES) {
    throw new WebPageError("That page is too large to import.");
  }

  const html = (await response.text()).slice(0, MAX_BYTES);
  const page = extractReadableText(html);

  if (!page.text) {
    throw new WebPageError(
      "No readable text was found on that page. It may be rendered by JavaScript."
    );
  }

  return {
    title: page.title || url.hostname,
    text: page.text,
  };
}
