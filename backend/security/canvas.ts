import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const DEFAULT_CANVAS_SUFFIX = ".instructure.com";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

type CanvasOAuthStatePayload = {
  domain: string;
  expiresAt: number;
  nonce: string;
};

function configuredCanvasDomains(): string[] {
  return (process.env.CANVAS_ALLOWED_DOMAINS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase().replace(/\.$/, ""))
    .filter(Boolean);
}

function isPrivateOrReservedIpv4(hostname: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return false;

  const octets = hostname.split(".").map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return true;

  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isConfiguredCanvasDomain(hostname: string): boolean {
  return configuredCanvasDomains().some(
    (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`)
  );
}

/**
 * Accept only HTTPS Canvas hosts that cannot directly address the local network.
 * OAuth is stricter because the Canvas client secret is sent during token exchange:
 * unlisted custom domains must be explicitly added to CANVAS_ALLOWED_DOMAINS.
 */
export function normalizeCanvasDomain(
  input: string,
  options: { forOAuth?: boolean } = {}
): string {
  const candidate = input.trim();
  if (!candidate || candidate.length > 300) {
    throw new Error("A valid Canvas domain is required.");
  }

  const url = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new Error("Canvas must be configured with an HTTPS domain only.");
  }

  if (
    !hostname.includes(".") ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.includes(":") ||
    isPrivateOrReservedIpv4(hostname) ||
    hostname.length > 253 ||
    hostname.split(".").some(
      (label) =>
        !label ||
        label.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
    )
  ) {
    throw new Error("Canvas domain is not a valid public hostname.");
  }

  if (
    options.forOAuth &&
    hostname !== "instructure.com" &&
    !hostname.endsWith(DEFAULT_CANVAS_SUFFIX) &&
    !isConfiguredCanvasDomain(hostname)
  ) {
    throw new Error(
      "This custom Canvas OAuth domain is not allowlisted by the application administrator."
    );
  }

  return hostname;
}

export function assertCanvasUrl(urlInput: string | URL, expectedDomain: string): URL {
  const expected = normalizeCanvasDomain(expectedDomain);
  const url = new URL(urlInput);
  const actual = normalizeCanvasDomain(url.hostname);

  if (
    url.protocol !== "https:" ||
    actual !== expected ||
    (url.port && url.port !== "443") ||
    url.username ||
    url.password
  ) {
    throw new Error("Canvas returned an unsafe cross-origin URL.");
  }

  return url;
}

function stateSecret(): string {
  const secret =
    process.env.CANVAS_OAUTH_STATE_SECRET ?? process.env.CANVAS_CLIENT_SECRET;
  if (!secret) throw new Error("Canvas OAuth is not configured.");
  return secret;
}

function signState(encodedPayload: string): string {
  return createHmac("sha256", stateSecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function createCanvasOAuthState(domain: string): {
  cookieNonce: string;
  state: string;
} {
  const payload: CanvasOAuthStatePayload = {
    domain: normalizeCanvasDomain(domain, { forOAuth: true }),
    expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
    nonce: randomBytes(24).toString("base64url"),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    cookieNonce: payload.nonce,
    state: `${encodedPayload}.${signState(encodedPayload)}`,
  };
}

export function verifyCanvasOAuthState(
  state: string,
  cookieNonce: string | undefined
): CanvasOAuthStatePayload {
  const [encodedPayload, suppliedSignature, ...extra] = state.split(".");
  if (!encodedPayload || !suppliedSignature || extra.length > 0 || !cookieNonce) {
    throw new Error("Canvas OAuth state is missing.");
  }

  const expectedSignature = signState(encodedPayload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    throw new Error("Canvas OAuth state is invalid.");
  }

  let payload: CanvasOAuthStatePayload;
  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as CanvasOAuthStatePayload;
  } catch {
    throw new Error("Canvas OAuth state is invalid.");
  }

  const suppliedNonce = Buffer.from(payload.nonce ?? "");
  const expectedNonce = Buffer.from(cookieNonce);
  if (
    suppliedNonce.length !== expectedNonce.length ||
    !timingSafeEqual(suppliedNonce, expectedNonce) ||
    !Number.isFinite(payload.expiresAt) ||
    payload.expiresAt < Date.now()
  ) {
    throw new Error("Canvas OAuth state has expired or does not match this browser.");
  }

  return {
    ...payload,
    domain: normalizeCanvasDomain(payload.domain, { forOAuth: true }),
  };
}
