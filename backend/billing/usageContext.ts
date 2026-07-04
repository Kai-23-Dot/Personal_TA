/**
 * Per-request user context for token metering.
 *
 * AI helper functions (backend/ai/*) don't receive a userId. To attribute
 * token usage to the right user without threading userId through every call
 * site, API routes wrap their handler body in `runWithUsageContext(userId, fn)`.
 * The model middleware in backend/ai/provider.ts reads the current userId via
 * `getUsageUserId()` and records usage against it.
 */
import { AsyncLocalStorage } from "node:async_hooks";

type UsageStore = { userId: string };

const storage = new AsyncLocalStorage<UsageStore>();

/** Run `fn` with `userId` bound as the active usage-metering user. */
export function runWithUsageContext<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return storage.run({ userId }, fn);
}

/** Current user id for metering, or null when no context is active. */
export function getUsageUserId(): string | null {
  return storage.getStore()?.userId ?? null;
}
