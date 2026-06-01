import { htmlToPlainText } from "@/lib/lms/canvas";
import { extractFileText, mimeToFileType } from "@/lib/utils/extractFileText";
import { normalizeDocumentText, stripBoilerplate } from "./documentNormalizer";

export async function extractFromHtml(html: string | null | undefined): Promise<string> {
  const plain = htmlToPlainText(html) ?? "";
  return normalizeDocumentText(stripBoilerplate(plain));
}

export async function extractFromFileBuffer(buffer: Buffer, mimeType: string): Promise<string | null> {
  const type = mimeToFileType(mimeType);
  if (!type) return null;
  const text = await extractFileText(buffer, type);
  if (!text) return null;
  return normalizeDocumentText(stripBoilerplate(text));
}

function extractGoogleDocId(url: string): string | null {
  const docMatch = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (docMatch) return docMatch[1];
  const slideMatch = url.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/);
  if (slideMatch) return slideMatch[1];
  const fileMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];
  return null;
}

async function fetchGoogleUrlText(url: string, authHeaders?: HeadersInit): Promise<string | null> {
  const res = await fetch(url, { headers: authHeaders });
  if (!res.ok) return null;
  const text = (await res.text()).trim();
  if (!text) return null;
  return normalizeDocumentText(stripBoilerplate(text));
}

export async function extractFromGoogleLink(params: {
  url: string;
  googleApiKey?: string;
  oauthAccessToken?: string | null;
}): Promise<string | null> {
  const { url, googleApiKey, oauthAccessToken } = params;
  const docId = extractGoogleDocId(url);
  if (!docId) return null;

  const authHeaders = oauthAccessToken ? { Authorization: `Bearer ${oauthAccessToken}` } : undefined;

  // Google Docs export
  if (/docs\.google\.com\/document\//.test(url)) {
    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
    return fetchGoogleUrlText(exportUrl, authHeaders);
  }

  // Google Slides export (txt first, then pptx fallback)
  if (/docs\.google\.com\/presentation\//.test(url)) {
    const txtUrl = `https://docs.google.com/presentation/d/${docId}/export?format=txt`;
    const txt = await fetchGoogleUrlText(txtUrl, authHeaders);
    if (txt) return txt;

    const pptxRes = await fetch(`https://docs.google.com/presentation/d/${docId}/export/pptx`, {
      headers: authHeaders,
    });
    if (!pptxRes.ok) return null;
    const buffer = Buffer.from(await pptxRes.arrayBuffer());
    const pptxText = await extractFileText(buffer, "pptx");
    return pptxText ? normalizeDocumentText(stripBoilerplate(pptxText)) : null;
  }

  // Google Drive generic file metadata + export/download
  if (!googleApiKey) return null;
  const metaUrl = `https://www.googleapis.com/drive/v3/files/${docId}?key=${encodeURIComponent(googleApiKey)}&fields=id,name,mimeType,exportLinks,webViewLink`;
  const metaRes = await fetch(metaUrl, { headers: authHeaders });
  if (!metaRes.ok) return null;
  const meta = await metaRes.json() as {
    mimeType?: string;
    exportLinks?: Record<string, string>;
  };

  const exportTxt = meta.exportLinks?.["text/plain"];
  if (exportTxt) {
    const txt = await fetchGoogleUrlText(exportTxt, authHeaders);
    if (txt) return txt;
  }

  // Fallback: download binary and attempt parse (pptx/docx/pdf/txt)
  const mediaUrl = `https://www.googleapis.com/drive/v3/files/${docId}?alt=media&key=${encodeURIComponent(googleApiKey)}`;
  const mediaRes = await fetch(mediaUrl, { headers: authHeaders });
  if (!mediaRes.ok) return null;
  const mimeType = mediaRes.headers.get("content-type") ?? meta.mimeType ?? "";
  const fileType = mimeToFileType(mimeType);
  if (!fileType) return null;
  const buffer = Buffer.from(await mediaRes.arrayBuffer());
  return extractFromFileBuffer(buffer, mimeType);
}
