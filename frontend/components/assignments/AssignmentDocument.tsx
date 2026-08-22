"use client";

import DOMPurify from "dompurify";
import { useEffect, useState } from "react";

function decodeEncodedMarkup(value: string): string {
  if (!/&lt;\/?(?:p|div|h[1-6]|table|ul|ol|li|strong|em|br)\b/i.test(value)) {
    return value;
  }

  const decoder = document.createElement("textarea");
  decoder.innerHTML = value;
  return decoder.value;
}

export function AssignmentDocument({ html }: { html: string }) {
  const [safeHtml, setSafeHtml] = useState("");

  useEffect(() => {
    const source = decodeEncodedMarkup(html);
    const sanitized = String(DOMPurify.sanitize(source, {
      ADD_ATTR: ["target"],
      FORBID_TAGS: ["script", "style", "form", "input", "button", "textarea", "select", "option", "iframe", "object", "embed"],
      FORBID_ATTR: ["style", "class", "id", "srcset"],
    }));

    const parsed = new DOMParser().parseFromString(sanitized, "text/html");
    parsed.querySelectorAll("a").forEach((link) => {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    });
    setSafeHtml(parsed.body.innerHTML);
  }, [html]);

  if (!safeHtml) {
    return <p className="text-sm text-slate-400">Loading assignment instructions…</p>;
  }

  return (
    <div
      className="assignment-document"
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
