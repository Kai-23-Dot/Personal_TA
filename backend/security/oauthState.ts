import { randomBytes, timingSafeEqual } from "node:crypto";

export function createOAuthNonce(): string {
  return randomBytes(32).toString("base64url");
}

export function verifyOAuthNonce(
  suppliedState: string | null,
  cookieState: string | undefined
): boolean {
  if (!suppliedState || !cookieState) return false;
  const supplied = Buffer.from(suppliedState);
  const expected = Buffer.from(cookieState);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
