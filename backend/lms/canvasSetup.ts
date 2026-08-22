/**
 * Turn anything a student is likely to paste (a host, school URL, course URL,
 * or Canvas settings URL) into the hostname required by the Canvas API.
 * The API still performs the authoritative security validation.
 */
export function normalizeCanvasHostInput(input: string): string {
  const value = input.trim();
  if (!value) throw new Error("Enter your school's Canvas address first.");

  let url: URL;
  try {
    url = new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    throw new Error("Enter a valid Canvas address, such as school.instructure.com.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Canvas must use a secure https:// address.");
  }
  if (url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("Enter your school's Canvas website without a username, password, or custom port.");
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || !host.includes(".")) {
    throw new Error("Enter a valid Canvas address, such as school.instructure.com.");
  }
  return host;
}

export function canvasSettingsUrl(input: string): string {
  return `https://${normalizeCanvasHostInput(input)}/profile/settings`;
}
