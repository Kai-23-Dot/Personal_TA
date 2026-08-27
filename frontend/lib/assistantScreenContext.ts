export const MAX_VISIBLE_SCREEN_CHARS = 3_600;
export const MAX_PAGE_CONTEXT_CHARS = 7_200;
export const MAX_ASSISTANT_REQUEST_CONTEXT_CHARS = 7_900;

const PRIVATE_OR_NON_CONTENT_SELECTOR = [
  "input",
  "textarea",
  "select",
  "option",
  "script",
  "style",
  "noscript",
  "template",
  "[contenteditable='true']",
  "[data-assistant-private]",
  "[data-assistant-ignore]",
  "[hidden]",
  "[aria-hidden='true']",
].join(",");

/** Normalize and cap browser-derived text before it is sent with a chat request. */
export function normalizeAssistantContextText(value: string, maxChars: number): string {
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (normalized.length <= maxChars) return normalized;
  const suffix = "\n[Screen context truncated]";
  return `${normalized.slice(0, Math.max(0, maxChars - suffix.length)).trimEnd()}${suffix}`;
}

function isVisibleTextNode(node: Text, view: Window): boolean {
  const parent = node.parentElement;
  if (!parent || !node.textContent?.trim()) return false;
  if (parent.closest(PRIVATE_OR_NON_CONTENT_SELECTOR)) return false;

  const style = view.getComputedStyle(parent);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

/**
 * Read only rendered text from the active workspace. Form values, tokens,
 * editable content, and explicitly private/ignored subtrees are never read.
 */
export function readVisibleScreenContext(root: HTMLElement, pathname: string): string {
  const view = root.ownerDocument.defaultView;
  if (!view) return `Route: ${pathname}`;

  const walker = root.ownerDocument.createTreeWalker(root, view.NodeFilter.SHOW_TEXT);
  const pieces: string[] = [];
  let node = walker.nextNode();
  while (node) {
    if (isVisibleTextNode(node as Text, view)) pieces.push(node.textContent ?? "");
    node = walker.nextNode();
  }

  const visibleText = normalizeAssistantContextText(pieces.join("\n"), MAX_VISIBLE_SCREEN_CHARS);
  return visibleText
    ? `Route: ${pathname}\nVisible workspace content:\n${visibleText}`
    : `Route: ${pathname}\nVisible workspace content: No readable page text is currently rendered.`;
}

/** Structured page state is retained before the lower-priority DOM snapshot. */
export function mergeAssistantContextSources(
  sources: Record<string, string>,
  maxChars = MAX_PAGE_CONTEXT_CHARS
): string {
  const ordered = Object.entries(sources)
    .filter(([, content]) => content.trim())
    .sort(([left], [right]) => Number(left === "visible-screen") - Number(right === "visible-screen"));

  let merged = "";
  for (const [source, content] of ordered) {
    const label = source === "visible-screen" ? "LIVE SCREEN SNAPSHOT" : "STRUCTURED PAGE STATE";
    const section = `${label}:\n${content.trim()}`;
    const candidate = merged ? `${merged}\n\n${section}` : section;
    if (candidate.length <= maxChars) {
      merged = candidate;
      continue;
    }

    const remaining = maxChars - merged.length - (merged ? 2 : 0);
    if (remaining > 80) {
      const bounded = normalizeAssistantContextText(section, remaining);
      merged = merged ? `${merged}\n\n${bounded}` : bounded;
    }
    break;
  }

  return merged;
}

export function buildAssistantRequestContext(
  pathnameContext: string,
  pageContent: string
): string {
  const combined = pageContent
    ? `${pathnameContext}\n\nCURRENT SCREEN CONTENT:\n${pageContent}`
    : pathnameContext;
  return normalizeAssistantContextText(combined, MAX_ASSISTANT_REQUEST_CONTEXT_CHARS);
}
