import { htmlToPlainText } from "@/backend/lms/canvas";
import {
  detectFileType,
  extractFileText,
  mimeToFileType,
} from "@/backend/utils/extractFileText";
import { normalizeDocumentText, stripBoilerplate } from "./documentNormalizer";

const GOOGLE_FETCH_TIMEOUT_MS = 15_000;
const MAX_GOOGLE_FILE_BYTES = 25 * 1024 * 1024;

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

export type GoogleDriveLink = {
  id: string;
  kind: "document" | "file" | "presentation";
};

export function parseGoogleDriveLink(urlInput: string): GoogleDriveLink | null {
  let url: URL;
  try {
    url = new URL(urlInput);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    !["docs.google.com", "drive.google.com"].includes(url.hostname)
  ) {
    return null;
  }

  const document = url.pathname.match(/^\/document\/d\/([a-zA-Z0-9_-]+)/);
  const presentation = url.pathname.match(
    /^\/presentation\/d\/([a-zA-Z0-9_-]+)/
  );
  const driveFile = url.pathname.match(/^\/file\/d\/([a-zA-Z0-9_-]+)/);
  const queryId = url.searchParams.get("id");
  const match = document ?? presentation ?? driveFile;
  const id = match?.[1] ?? queryId;
  if (!id || !/^[a-zA-Z0-9_-]{10,200}$/.test(id)) return null;

  return {
    id,
    kind: document
      ? "document"
      : presentation
        ? "presentation"
        : "file",
  };
}

async function fetchGoogle(
  url: string,
  authHeaders?: HeadersInit
): Promise<Response> {
  return fetch(url, {
    headers: authHeaders,
    signal: AbortSignal.timeout(GOOGLE_FETCH_TIMEOUT_MS),
  });
}

async function responseToBoundedBuffer(
  response: Response,
  maxBytes = MAX_GOOGLE_FILE_BYTES
): Promise<Buffer | null> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return null;
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), received);
}

async function fetchGoogleUrlText(
  url: string,
  authHeaders?: HeadersInit
): Promise<string | null> {
  const res = await fetchGoogle(url, authHeaders);
  if (!res.ok) return null;
  const buffer = await responseToBoundedBuffer(res, 5 * 1024 * 1024);
  if (!buffer) return null;
  const text = buffer.toString("utf8").trim();
  if (!text) return null;
  return normalizeDocumentText(stripBoilerplate(text));
}

export async function extractFromGoogleLink(params: {
  url: string;
  googleApiKey?: string;
  oauthAccessToken?: string | null;
}): Promise<string | null> {
  const { url, googleApiKey, oauthAccessToken } = params;
  const driveLink = parseGoogleDriveLink(url);
  if (!driveLink) return null;
  const docId = driveLink.id;

  const authHeaders = oauthAccessToken ? { Authorization: `Bearer ${oauthAccessToken}` } : undefined;

  // Google Docs export
  if (driveLink.kind === "document") {
    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
    return fetchGoogleUrlText(exportUrl, authHeaders);
  }

  // Google Slides export (txt first, then pptx fallback)
  if (driveLink.kind === "presentation") {
    const txtUrl = `https://docs.google.com/presentation/d/${docId}/export?format=txt`;
    const txt = await fetchGoogleUrlText(txtUrl, authHeaders);
    if (txt) return txt;

    const pptxRes = await fetchGoogle(
      `https://docs.google.com/presentation/d/${docId}/export/pptx`,
      authHeaders
    );
    if (!pptxRes.ok) return null;
    const buffer = await responseToBoundedBuffer(pptxRes);
    if (!buffer) return null;
    const pptxText = await extractFileText(buffer, "pptx");
    return pptxText ? normalizeDocumentText(stripBoilerplate(pptxText)) : null;
  }

  // Google Drive generic file metadata + export/download. OAuth is sufficient;
  // an API key is optional when an OAuth token is present.
  const metadataUrl = new URL(
    `https://www.googleapis.com/drive/v3/files/${docId}`
  );
  metadataUrl.searchParams.set(
    "fields",
    "id,name,mimeType,exportLinks,webViewLink,size"
  );
  if (googleApiKey) metadataUrl.searchParams.set("key", googleApiKey);

  const metaRes =
    oauthAccessToken || googleApiKey
      ? await fetchGoogle(metadataUrl.toString(), authHeaders)
      : null;
  const meta = metaRes?.ok ? await metaRes.json() as {
    name?: string;
    mimeType?: string;
    exportLinks?: Record<string, string>;
    size?: string;
  } : null;

  const exportTxt = meta?.exportLinks?.["text/plain"];
  if (exportTxt) {
    const txt = await fetchGoogleUrlText(exportTxt, authHeaders);
    if (txt) return txt;
  }

  if (meta?.mimeType === "application/vnd.google-apps.presentation") {
    const presentationUrl =
      meta.exportLinks?.[
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      ] ??
      `https://www.googleapis.com/drive/v3/files/${docId}/export?mimeType=${encodeURIComponent(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      )}`;
    const presentationRes = await fetchGoogle(presentationUrl, authHeaders);
    if (!presentationRes.ok) return null;
    const buffer = await responseToBoundedBuffer(presentationRes);
    if (!buffer) return null;
    const text = await extractFileText(buffer, "pptx");
    return text ? normalizeDocumentText(stripBoilerplate(text)) : null;
  }

  // Fallback: download binary and attempt parse (pptx/docx/pdf/txt). Public
  // Drive files can use the uc endpoint even when no API key is configured.
  const mediaUrl = oauthAccessToken || googleApiKey
    ? new URL(`https://www.googleapis.com/drive/v3/files/${docId}`)
    : new URL("https://drive.google.com/uc");
  if (mediaUrl.hostname === "www.googleapis.com") {
    mediaUrl.searchParams.set("alt", "media");
    if (googleApiKey) mediaUrl.searchParams.set("key", googleApiKey);
  } else {
    mediaUrl.searchParams.set("export", "download");
    mediaUrl.searchParams.set("id", docId);
  }

  if (meta?.size && Number(meta.size) > MAX_GOOGLE_FILE_BYTES) return null;
  const mediaRes = await fetchGoogle(mediaUrl.toString(), authHeaders);
  if (!mediaRes.ok) return null;
  const mimeType = mediaRes.headers.get("content-type") ?? meta?.mimeType ?? "";
  const fileType = detectFileType(mimeType, meta?.name);
  if (!fileType) return null;
  const buffer = await responseToBoundedBuffer(mediaRes);
  if (!buffer) return null;
  const extracted = await extractFileText(buffer, fileType);
  return extracted
    ? normalizeDocumentText(stripBoilerplate(extracted))
    : null;
}
