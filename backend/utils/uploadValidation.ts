const UPLOAD_RULES = {
  docx: {
    fileType: "docx",
    maxBytes: 25 * 1024 * 1024,
    mimeTypes: new Set([
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]),
  },
  gif: {
    fileType: "image",
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: new Set(["image/gif"]),
  },
  jpeg: {
    fileType: "image",
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: new Set(["image/jpeg", "image/jpg"]),
  },
  jpg: {
    fileType: "image",
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: new Set(["image/jpeg", "image/jpg"]),
  },
  m4a: {
    fileType: "audio",
    maxBytes: 20 * 1024 * 1024,
    mimeTypes: new Set(["audio/m4a", "audio/mp4", "audio/x-m4a"]),
  },
  md: {
    fileType: "md",
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: new Set(["text/markdown", "text/plain"]),
  },
  mp3: {
    fileType: "audio",
    maxBytes: 20 * 1024 * 1024,
    mimeTypes: new Set(["audio/mpeg", "audio/mp3"]),
  },
  ogg: {
    fileType: "audio",
    maxBytes: 20 * 1024 * 1024,
    mimeTypes: new Set(["audio/ogg"]),
  },
  pdf: {
    fileType: "pdf",
    maxBytes: 25 * 1024 * 1024,
    mimeTypes: new Set(["application/pdf"]),
  },
  png: {
    fileType: "image",
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: new Set(["image/png"]),
  },
  pptx: {
    fileType: "pptx",
    maxBytes: 25 * 1024 * 1024,
    mimeTypes: new Set([
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ]),
  },
  txt: {
    fileType: "txt",
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: new Set(["text/plain"]),
  },
  wav: {
    fileType: "audio",
    maxBytes: 20 * 1024 * 1024,
    mimeTypes: new Set(["audio/wav", "audio/wave", "audio/x-wav"]),
  },
  webm: {
    fileType: "audio",
    maxBytes: 20 * 1024 * 1024,
    mimeTypes: new Set(["audio/webm"]),
  },
  webp: {
    fileType: "image",
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: new Set(["image/webp"]),
  },
} as const;

export type ValidatedNoteUpload = {
  extension: keyof typeof UPLOAD_RULES;
  fileType: string;
  safeFileName: string;
};

export function sanitizeUploadFileName(fileName: string): string {
  const basename = fileName
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^a-zA-Z0-9._() -]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
  return basename || "upload";
}

export function validateNoteUpload(
  file: Pick<File, "name" | "size" | "type">,
  allowedFileTypes?: ReadonlySet<string>
): ValidatedNoteUpload {
  const safeFileName = sanitizeUploadFileName(file.name);
  const extension = safeFileName
    .split(".")
    .pop()
    ?.toLowerCase() as keyof typeof UPLOAD_RULES | undefined;
  const rule = extension ? UPLOAD_RULES[extension] : undefined;

  if (!extension || !rule || (allowedFileTypes && !allowedFileTypes.has(rule.fileType))) {
    throw new Error("Unsupported file type.");
  }
  const normalizedMime = file.type.toLowerCase().split(";")[0].trim();
  if (normalizedMime && !(rule.mimeTypes as ReadonlySet<string>).has(normalizedMime)) {
    throw new Error("The file extension does not match its media type.");
  }
  if (file.size <= 0) throw new Error("The uploaded file is empty.");
  if (file.size > rule.maxBytes) {
    throw new Error(
      `File exceeds the ${Math.floor(rule.maxBytes / 1024 / 1024)} MB limit.`
    );
  }

  return { extension, fileType: rule.fileType, safeFileName };
}
