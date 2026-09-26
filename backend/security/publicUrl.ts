import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

export type PublicResource = {
  url: string;
  contentType: string;
  buffer: Buffer;
};

export type PublicResourceOptions = {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
};

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
    );
  }

  if (family === 6) {
    // Only ordinary global unicast IPv6 is allowed. This also excludes mapped
    // IPv4, NAT64, loopback, link-local, unique-local and multicast addresses.
    const [first, second = "0"] = address.toLowerCase().split(":");
    const a = parseInt(first, 16);
    const b = parseInt(second || "0", 16);
    return (
      a >= 0x2000 && a <= 0x3fff &&
      !(a === 0x2001 && (b <= 0x1ff || b === 0xdb8)) &&
      a !== 0x2002 &&
      !(a === 0x3fff && b <= 0xfff)
    );
  }
  return false;
}

function parsePublicUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Enter a valid public HTTP or HTTPS URL.");
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username || url.password || url.port
  ) {
    throw new Error("Use a public HTTP or HTTPS URL with a standard port and no credentials.");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (
    !hostname ||
    hostname === "localhost" ||
    /\.(localhost|local|internal|lan|home)$/.test(hostname) ||
    (!isIP(hostname) && !hostname.includes(".")) ||
    (isIP(hostname) && !isPublicAddress(hostname))
  ) {
    throw new Error("This URL does not point to a public internet address.");
  }
  url.hash = "";
  return url;
}

function withAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      }
    );
  });
}

async function resolvePublicAddress(url: URL, signal: AbortSignal) {
  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const family = isIP(hostname);
  let addresses;
  try {
    addresses = family
      ? [{ address: hostname, family }]
      : await withAbort(lookup(hostname, { all: true, verbatim: true }), signal);
  } catch {
    if (signal.aborted) throw signal.reason;
    throw new Error("The website address could not be resolved. Check the URL and try again.");
  }
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("This URL resolves to a private or reserved address and cannot be imported.");
  }
  return addresses[0];
}

type HopResult = { location: string } | { resource: PublicResource };

function requestResource(
  url: URL,
  address: { address: string; family: number },
  maxBytes: number,
  signal: AbortSignal
): Promise<HopResult> {
  return new Promise((resolve, reject) => {
    const request = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = request(url, {
      method: "GET",
      // A fresh connection and pinned lookup prevent pooled sockets or a second
      // DNS resolution from bypassing the public-address check above.
      agent: false,
      family: address.family,
      lookup: (_hostname, options, callback) => {
        callback(null, options.all ? [address] : address.address, address.family);
      },
      signal,
      maxHeaderSize: 16 * 1024,
      headers: {
        "User-Agent": "Conlearn/1.0",
        Accept: "*/*",
        "Accept-Encoding": "identity",
      },
    }, (response) => {
      response.on("error", reject);
      response.on("aborted", () => reject(new Error("The website closed the download before it finished.")));
      const status = response.statusCode ?? 0;
      if (REDIRECT_STATUSES.has(status)) {
        const location = response.headers.location;
        if (location) resolve({ location });
        else reject(new Error("The website returned a redirect without a destination."));
        response.destroy();
        return;
      }
      if (status < 200 || status >= 300) {
        reject(new Error(`The website returned HTTP ${status}. Check that the page is publicly accessible.`));
        response.destroy();
        return;
      }
      const contentLength = Number(response.headers["content-length"] ?? 0);
      if (contentLength > maxBytes) {
        reject(new Error(`The source exceeds the ${maxBytes}-byte download limit.`));
        response.destroy();
        return;
      }
      const encoding = response.headers["content-encoding"];
      if (encoding && encoding.toLowerCase() !== "identity") {
        reject(new Error("The website returned an unsupported compressed download."));
        response.destroy();
        return;
      }

      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          reject(new Error(`The source exceeds the ${maxBytes}-byte download limit.`));
          response.destroy();
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        resolve({ resource: {
          url: url.href,
          contentType: response.headers["content-type"] ?? "",
          buffer: Buffer.concat(chunks),
        } });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

/** Download an unauthenticated public resource, validating and pinning every hop. */
export async function fetchPublicResource(
  input: string,
  options: PublicResourceOptions = {}
): Promise<PublicResource> {
  const maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxRedirects = options.maxRedirects ?? 5;
  if (
    !Number.isSafeInteger(maxBytes) || maxBytes < 1 ||
    !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647 ||
    !Number.isSafeInteger(maxRedirects) || maxRedirects < 0
  ) {
    throw new Error("Download limits must be valid positive integers (redirects may be zero).");
  }

  let url = parsePublicUrl(input);
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error("The source download timed out. Try again or use a smaller source."));
  }, timeoutMs);
  try {
    for (let redirects = 0; ; redirects++) {
      const address = await resolvePublicAddress(url, controller.signal);
      if (controller.signal.aborted) throw controller.signal.reason;
      const result = await requestResource(url, address, maxBytes, controller.signal);
      if ("resource" in result) return result.resource;
      if (redirects >= maxRedirects) throw new Error("The website redirected too many times.");
      let destination: URL;
      try {
        destination = new URL(result.location, url);
      } catch {
        throw new Error("The website returned an invalid redirect URL.");
      }
      url = parsePublicUrl(destination.href);
    }
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
