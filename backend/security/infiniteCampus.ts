import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { normalizeCanvasDomain } from "./canvas";

const STATE_TTL_MS = 10 * 60 * 1000;

type InfiniteCampusState = {
  domain: string;
  expiresAt: number;
  nonce: string;
};

function allowedCustomDomains(): string[] {
  return (process.env.INFINITE_CAMPUS_ALLOWED_DOMAINS ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeInfiniteCampusDomain(input: string): string {
  const domain = normalizeCanvasDomain(input);
  const configured = allowedCustomDomains().some(
    (allowed) => domain === allowed || domain.endsWith(`.${allowed}`)
  );
  if (
    domain !== "infinitecampus.org" &&
    !domain.endsWith(".infinitecampus.org") &&
    !configured
  ) {
    throw new Error("Infinite Campus domain is not allowlisted.");
  }
  return domain;
}

function secret(): string {
  const value =
    process.env.INFINITE_CAMPUS_OAUTH_STATE_SECRET ??
    process.env.INFINITE_CAMPUS_CLIENT_SECRET;
  if (!value) throw new Error("Infinite Campus OAuth is not configured.");
  return value;
}

function signature(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createInfiniteCampusState(domainInput: string): {
  cookieNonce: string;
  state: string;
} {
  const payload: InfiniteCampusState = {
    domain: normalizeInfiniteCampusDomain(domainInput),
    expiresAt: Date.now() + STATE_TTL_MS,
    nonce: randomBytes(24).toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    cookieNonce: payload.nonce,
    state: `${encoded}.${signature(encoded)}`,
  };
}

export function verifyInfiniteCampusState(
  state: string,
  cookieNonce: string | undefined
): InfiniteCampusState {
  const [encoded, suppliedSignature, ...extra] = state.split(".");
  if (!encoded || !suppliedSignature || extra.length || !cookieNonce) {
    throw new Error("Infinite Campus OAuth state is missing.");
  }
  const expectedSignature = Buffer.from(signature(encoded));
  const suppliedSignatureBuffer = Buffer.from(suppliedSignature);
  if (
    expectedSignature.length !== suppliedSignatureBuffer.length ||
    !timingSafeEqual(expectedSignature, suppliedSignatureBuffer)
  ) {
    throw new Error("Infinite Campus OAuth state is invalid.");
  }

  let payload: InfiniteCampusState;
  try {
    payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as InfiniteCampusState;
  } catch {
    throw new Error("Infinite Campus OAuth state is invalid.");
  }
  const expectedNonce = Buffer.from(cookieNonce);
  const suppliedNonce = Buffer.from(payload.nonce ?? "");
  if (
    expectedNonce.length !== suppliedNonce.length ||
    !timingSafeEqual(expectedNonce, suppliedNonce) ||
    !Number.isFinite(payload.expiresAt) ||
    payload.expiresAt < Date.now()
  ) {
    throw new Error("Infinite Campus OAuth state is expired or invalid.");
  }
  return { ...payload, domain: normalizeInfiniteCampusDomain(payload.domain) };
}
