import { z } from "zod";
import type { CoreMessage } from "ai";

const MAX_MESSAGES = 50;
const MAX_MESSAGE_CHARS = 20_000;
const MAX_TOTAL_TEXT_CHARS = 100_000;
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 2_500_000;
const MAX_TOTAL_ATTACHMENT_BYTES = 3_000_000;

const allowedImages = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function hasExpectedImageSignature(contentType: string, base64: string): boolean {
  try {
    const bytes = Uint8Array.from(atob(base64.slice(0, 24)), (char) => char.charCodeAt(0));
    if (contentType === "image/png") {
      return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
        .every((byte, index) => bytes[index] === byte);
    }
    if (contentType === "image/jpeg") {
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    }
    if (contentType === "image/gif") {
      return String.fromCharCode(...bytes.slice(0, 6)) === "GIF87a" ||
        String.fromCharCode(...bytes.slice(0, 6)) === "GIF89a";
    }
    if (contentType === "image/webp") {
      return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
        String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    }
  } catch {
    return false;
  }
  return false;
}

const attachmentSchema = z.object({
  contentType: z.string(),
  url: z.string(),
  name: z.string().max(255).optional(),
});

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(MAX_MESSAGE_CHARS),
  experimental_attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS).optional(),
});

const chatBodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(MAX_MESSAGES),
  sessionId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
  noteId: z.string().uuid().optional(),
  assignmentId: z.string().uuid().optional(),
  context: z.string().max(8_000).optional(),
});

export type ValidChatBody = z.infer<typeof chatBodySchema>;

export function parseChatBody(value: unknown):
  | { success: true; data: ValidChatBody; messages: CoreMessage[] }
  | { success: false; error: string } {
  const parsed = chatBodySchema.safeParse(value);
  if (!parsed.success) return { success: false, error: "Invalid chat request." };

  const totalTextChars = parsed.data.messages.reduce(
    (total, message) => total + message.content.length,
    0
  );
  if (totalTextChars > MAX_TOTAL_TEXT_CHARS) {
    return { success: false, error: "Chat history is too large." };
  }

  if (parsed.data.messages.at(-1)?.role !== "user") {
    return { success: false, error: "The latest chat message must be from the user." };
  }
  const latestMessage = parsed.data.messages.at(-1)!;
  if (!latestMessage.content.trim() && !latestMessage.experimental_attachments?.length) {
    return { success: false, error: "The latest chat message is empty." };
  }

  let totalAttachmentBytes = 0;
  const messages: CoreMessage[] = [];

  for (const message of parsed.data.messages) {
    const attachments = message.experimental_attachments ?? [];
    if (message.role !== "user" && attachments.length > 0) {
      return { success: false, error: "Only user messages may include images." };
    }

    if (message.role === "user" && attachments.length > 0) {
      const content: Array<
        | { type: "text"; text: string }
        | { type: "image"; image: string; mimeType: string }
      > = [];
      if (message.content) content.push({ type: "text", text: message.content });

      for (const attachment of attachments) {
        if (!allowedImages.has(attachment.contentType)) {
          return { success: false, error: "Unsupported image type." };
        }

        const prefix = `data:${attachment.contentType};base64,`;
        if (!attachment.url.startsWith(prefix)) {
          return { success: false, error: "Images must be uploaded directly." };
        }

        const base64 = attachment.url.slice(prefix.length);
        if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
          return { success: false, error: "Invalid image data." };
        }

        if (!hasExpectedImageSignature(attachment.contentType, base64)) {
          return { success: false, error: "Image contents do not match its declared type." };
        }

        const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
        const byteLength = Math.floor((base64.length * 3) / 4) - padding;
        if (byteLength > MAX_ATTACHMENT_BYTES) {
          return { success: false, error: "An image is too large." };
        }
        totalAttachmentBytes += byteLength;
        if (totalAttachmentBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
          return { success: false, error: "Attached images are too large." };
        }

        content.push({
          type: "image",
          image: attachment.url,
          mimeType: attachment.contentType,
        });
      }

      messages.push({ role: "user", content } as CoreMessage);
      continue;
    }

    messages.push({ role: message.role, content: message.content } as CoreMessage);
  }

  return { success: true, data: parsed.data, messages };
}
