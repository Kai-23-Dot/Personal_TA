export const CANVAS_CONNECTION_AGREEMENT_VERSION = "2026-08-22";

export type CanvasConnectionAgreementMetadata = {
  accepted_at?: string;
  connection_method: "personal_access_token";
  presented_at?: string;
  status: "accepted" | "pending";
  version: string;
};

export function readCanvasConnectionAgreement(
  metadata: unknown
): CanvasConnectionAgreementMetadata | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;

  const agreement = (metadata as Record<string, unknown>).canvas_connection_agreement;
  if (!agreement || typeof agreement !== "object" || Array.isArray(agreement)) return null;

  const candidate = agreement as Record<string, unknown>;
  if (
    (candidate.status !== "accepted" && candidate.status !== "pending") ||
    candidate.connection_method !== "personal_access_token" ||
    typeof candidate.version !== "string"
  ) {
    return null;
  }

  return candidate as CanvasConnectionAgreementMetadata;
}

export function hasCurrentCanvasConnectionAgreement(metadata: unknown): boolean {
  const agreement = readCanvasConnectionAgreement(metadata);
  return Boolean(
    agreement?.status === "accepted" &&
      agreement.version === CANVAS_CONNECTION_AGREEMENT_VERSION &&
      agreement.accepted_at
  );
}

export function asMetadataRecord(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? { ...(metadata as Record<string, unknown>) }
    : {};
}
