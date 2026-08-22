export interface AdminIdentity {
  id: string;
  email?: string | null;
}

function configuredValues(name: "ADMIN_USER_IDS" | "ADMIN_EMAILS"): Set<string> {
  return new Set(
    (process.env[name] ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Owner access is an explicit, server-only allowlist. An empty allowlist denies
 * everyone; no profile field, URL, or client-side flag can grant access.
 */
export function isAdminIdentity(identity: AdminIdentity): boolean {
  const ids = configuredValues("ADMIN_USER_IDS");
  const emails = configuredValues("ADMIN_EMAILS");
  if (ids.size === 0 && emails.size === 0) return false;

  return (
    ids.has(identity.id.trim().toLowerCase()) ||
    Boolean(identity.email && emails.has(identity.email.trim().toLowerCase()))
  );
}
