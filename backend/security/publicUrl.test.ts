import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  httpRequest: vi.fn(),
  httpsRequest: vi.fn(),
}));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:http", () => ({ request: mocks.httpRequest }));
vi.mock("node:https", () => ({ request: mocks.httpsRequest }));

import { fetchPublicResource } from "./publicUrl";

type ResponseFixture = {
  status?: number;
  headers?: Record<string, string>;
  chunks?: string[];
  stall?: boolean;
};
const responses: ResponseFixture[] = [];

function mockRequest(
  _url: URL,
  options: RequestOptions,
  callback: (response: IncomingMessage) => void
): ClientRequest {
  const req = new EventEmitter() as ClientRequest;
  req.destroy = vi.fn((error?: Error) => {
    if (error) req.emit("error", error);
    return req;
  });
  options.signal?.addEventListener("abort", () => req.destroy(options.signal?.reason), { once: true });
  req.end = vi.fn(() => {
    queueMicrotask(() => {
      const fixture = responses.shift() ?? {};
      const response = Object.assign(new PassThrough(), {
        statusCode: fixture.status ?? 200,
        headers: fixture.headers ?? { "content-type": "text/html; charset=utf-8" },
      });
      callback(response as unknown as IncomingMessage);
      if (!fixture.stall && !response.destroyed) {
        for (const chunk of fixture.chunks ?? ["<p>Lesson</p>"]) {
          if (!response.destroyed) response.write(Buffer.from(chunk));
        }
        if (!response.destroyed) response.end();
      }
    });
    return req;
  }) as ClientRequest["end"];
  return req;
}

describe("public source downloads", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    responses.length = 0;
    mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    mocks.httpRequest.mockImplementation(mockRequest);
    mocks.httpsRequest.mockImplementation(mockRequest);
  });

  afterEach(() => vi.useRealTimers());

  it("returns content and pins the validated address without forwarding credentials", async () => {
    const result = await fetchPublicResource("https://example.com/lesson#section");
    expect(result).toEqual({
      url: "https://example.com/lesson",
      contentType: "text/html; charset=utf-8",
      buffer: Buffer.from("<p>Lesson</p>"),
    });
    expect(mocks.lookup).toHaveBeenCalledWith("example.com", { all: true, verbatim: true });
    const [url, options] = mocks.httpsRequest.mock.calls[0] as [URL, RequestOptions];
    expect(url.hostname).toBe("example.com");
    expect(options.agent).toBe(false);
    expect(options.headers).toEqual({
      "User-Agent": "Conlearn/1.0",
      Accept: "*/*",
      "Accept-Encoding": "identity",
    });
    const callback = vi.fn();
    options.lookup?.("example.com", {}, callback);
    expect(callback).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    options.lookup?.("example.com", { all: true }, callback);
    expect(callback).toHaveBeenLastCalledWith(null, [{ address: "93.184.216.34", family: 4 }], 4);
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
  });

  it.each([
    "file:///etc/passwd",
    "https://user:password@example.com",
    "https://example.com:8443",
    "http://localhost/",
    "http://printer.local/",
    "http://127.0.0.1/",
    "http://2130706433/",
    "http://0x7f000001/",
    "http://10.0.0.1/",
    "http://100.100.100.200/",
    "http://169.254.169.254/",
    "http://172.16.1.1/",
    "http://192.168.1.1/",
    "http://192.0.2.1/",
    "http://198.18.0.1/",
    "http://198.51.100.1/",
    "http://203.0.113.1/",
    "http://224.0.0.1/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[fc00::1]/",
    "http://[fe80::1]/",
    "http://[2001:db8::1]/",
    "http://[2002:7f00:1::]/",
    "http://[3fff::1]/",
  ])("rejects unsafe source %s before resolving or connecting", async (url) => {
    await expect(fetchPublicResource(url)).rejects.toThrow(/public|standard port/);
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.httpRequest).not.toHaveBeenCalled();
    expect(mocks.httpsRequest).not.toHaveBeenCalled();
  });

  it("rejects mixed public/private DNS answers before connecting", async () => {
    mocks.lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    await expect(fetchPublicResource("https://example.com")).rejects.toThrow(/private or reserved/);
    expect(mocks.httpsRequest).not.toHaveBeenCalled();
  });

  it("accepts an ordinary global IPv6 address without DNS resolution", async () => {
    await fetchPublicResource("https://[2606:4700:4700::1111]/");
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.httpsRequest.mock.calls[0][1].family).toBe(6);
  });

  it("follows relative redirects and validates DNS again even on the same host", async () => {
    responses.push({ status: 302, headers: { location: "/lesson" } });
    const result = await fetchPublicResource("http://example.com/start");
    expect(result.url).toBe("http://example.com/lesson");
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
    expect(mocks.httpRequest).toHaveBeenCalledTimes(2);
  });

  it("rejects redirects to private addresses before making the second request", async () => {
    responses.push({ status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } });
    await expect(fetchPublicResource("https://example.com")).rejects.toThrow(/public internet/);
    expect(mocks.httpsRequest).toHaveBeenCalledTimes(1);
    expect(mocks.httpRequest).not.toHaveBeenCalled();
  });

  it("blocks DNS rebinding on a redirect to the same host", async () => {
    responses.push({ status: 302, headers: { location: "/next" } });
    mocks.lookup
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
    await expect(fetchPublicResource("https://example.com")).rejects.toThrow(/private or reserved/);
    expect(mocks.httpsRequest).toHaveBeenCalledTimes(1);
  });

  it("bounds redirect loops", async () => {
    responses.push({ status: 302, headers: { location: "/again" } });
    await expect(fetchPublicResource("https://example.com", { maxRedirects: 0 })).rejects.toThrow(/too many times/);
    expect(mocks.httpsRequest).toHaveBeenCalledTimes(1);
  });

  it("enforces the size limit even when Content-Length is absent or false", async () => {
    responses.push({ headers: { "content-length": "1" }, chunks: ["1234", "5678"] });
    await expect(fetchPublicResource("https://example.com", { maxBytes: 6 })).rejects.toThrow(/download limit/);
  });

  it("rejects an oversized declared response before reading its body", async () => {
    responses.push({ headers: { "content-length": "1000" } });
    await expect(fetchPublicResource("https://example.com", { maxBytes: 6 })).rejects.toThrow(/download limit/);
  });

  it("reports inaccessible content without returning its error page", async () => {
    responses.push({ status: 403 });
    await expect(fetchPublicResource("https://example.com")).rejects.toThrow(/HTTP 403/);
  });

  it("times out DNS resolution as part of the total download deadline", async () => {
    vi.useFakeTimers();
    mocks.lookup.mockImplementation(() => new Promise(() => {}));
    const assertion = expect(fetchPublicResource("https://example.com", { timeoutMs: 100 })).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(101);
    await assertion;
    expect(mocks.httpsRequest).not.toHaveBeenCalled();
  });

  it("aborts a stalled response at the total download deadline", async () => {
    vi.useFakeTimers();
    responses.push({ stall: true });
    const assertion = expect(fetchPublicResource("https://example.com", { timeoutMs: 100 })).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(101);
    await assertion;
  });
});
