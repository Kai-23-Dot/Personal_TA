import { parse, type DefaultTreeAdapterMap } from "parse5";
import { normalizeDocumentText } from "@/backend/canvas-intelligence/documentNormalizer";

type Node = DefaultTreeAdapterMap["node"];
const OMIT_TAGS = new Set([
  "script", "style", "noscript", "template", "nav", "footer", "aside",
  "form", "button", "svg", "canvas", "iframe", "object",
]);
const BLOCK_TAGS = new Set([
  "p", "div", "section", "article", "main", "header", "h1", "h2", "h3",
  "h4", "h5", "h6", "li", "ul", "ol", "tr", "blockquote", "pre", "br",
]);

/** Parse returned HTML only; never execute page scripts or load subresources. */
export function extractWebsiteText(html: string): { text: string; title: string | null } {
  const document = parse(html);
  let title: Node | undefined;
  let body: Node | undefined;
  let main: Node | undefined;
  let article: Node | undefined;
  const pending: Node[] = [document];
  while (pending.length) {
    const node = pending.pop()!;
    if ("tagName" in node) {
      if (node.tagName === "title") title ??= node;
      if (node.tagName === "body") body ??= node;
      if (OMIT_TAGS.has(node.tagName) || node.attrs.some((attr) =>
        attr.name === "hidden" || (attr.name === "aria-hidden" && attr.value === "true")
      )) continue;
      if (node.tagName === "main" || node.attrs.some((attr) => attr.name === "role" && attr.value === "main")) main ??= node;
      if (node.tagName === "article") article ??= node;
    }
    if ("childNodes" in node) pending.push(...[...node.childNodes].reverse());
  }

  const readText = (root: Node): string => {
    const chunks: string[] = [];
    const stack: (Node | string)[] = [root];
    while (stack.length) {
      const node = stack.pop()!;
      if (typeof node === "string") { chunks.push(node); continue; }
      if (node.nodeName === "#text" && "value" in node) {
        chunks.push(node.value.replace(/\s+/g, " "));
        continue;
      }
      if ("tagName" in node) {
        if (node.tagName === "head" || OMIT_TAGS.has(node.tagName) || node.attrs.some((attr) =>
          attr.name === "hidden" || (attr.name === "aria-hidden" && attr.value === "true")
        )) continue;
        if (BLOCK_TAGS.has(node.tagName)) { chunks.push("\n"); stack.push("\n"); }
        if (node.tagName === "td" || node.tagName === "th") stack.push(" | ");
        if (node.tagName === "img") {
          const alt = node.attrs.find((attr) => attr.name === "alt")?.value;
          if (alt) chunks.push(` ${alt} `);
        }
      }
      if ("childNodes" in node) stack.push(...[...node.childNodes].reverse());
    }
    return normalizeDocumentText(chunks.join("").replace(/ *\n */g, "\n"));
  };

  let text = "";
  for (const candidate of [main, article, body, document]) {
    if (candidate) text = readText(candidate);
    if (text) break;
  }
  if (!text) throw new Error("The website returned no readable text. It may require JavaScript or sign-in.");
  return { text, title: title ? readText(title) || null : null };
}
