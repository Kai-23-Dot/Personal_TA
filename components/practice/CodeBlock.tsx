"use client";

import { useMemo } from "react";

const JAVA_KEYWORDS = [
  "abstract","assert","boolean","break","byte","case","catch","char","class","const","continue","default","do","double","else","enum","extends","final","finally","float","for","goto","if","implements","import","instanceof","int","interface","long","native","new","package","private","protected","public","return","short","static","strictfp","super","switch","synchronized","this","throw","throws","transient","try","void","volatile","while",
];

function escapeHtml(code: string) {
  return code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightJava(code: string) {
  let html = escapeHtml(code);
  // Strings
  html = html.replace(/("(?:\\.|[^"\\])*")/g, '<span class="code-string">$1</span>');
  // Comments
  html = html.replace(/(\/\/.*?$)/gm, '<span class="code-comment">$1</span>');
  html = html.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="code-comment">$1</span>');
  // Numbers
  html = html.replace(/\b(\d+)\b/g, '<span class="code-number">$1</span>');
  // Keywords
  const keywordPattern = new RegExp(`\\b(${JAVA_KEYWORDS.join("|")})\\b`, "g");
  html = html.replace(keywordPattern, '<span class="code-keyword">$1</span>');
  return html;
}

export function CodeBlock({ code, language = "java" }: { code: string; language?: string }) {
  const highlighted = useMemo(() => highlightJava(code), [code]);

  return (
    <pre className="code-block" aria-label={`${language} code block`}>
      <code dangerouslySetInnerHTML={{ __html: highlighted }} />
    </pre>
  );
}
