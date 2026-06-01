export function normalizeDocumentText(raw: string): string {
  return raw
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\n\s+\n/g, "\n\n")
    .trim();
}

export function stripBoilerplate(text: string): string {
  const lines = text.split("\n");
  const filtered = lines.filter((line) => {
    const l = line.trim().toLowerCase();
    if (!l) return true;
    if (l.startsWith("home") || l.startsWith("dashboard") || l.startsWith("course navigation")) return false;
    if (l.includes("this page was generated") || l.includes("instructure")) return false;
    return true;
  });
  return filtered.join("\n");
}
