/**
 * Audio lecture transcription using OpenAI GPT Transcribe.
 *
 * Step 1: raw transcription via OpenAI's audio transcription endpoint.
 * Step 2: a GPT-4.1 mini pass structures the transcript as study notes.
 *
 * Supported formats: mp3, mp4, m4a, wav, webm, ogg
 * Max file size: 25 MB per request.
 */
import { generateText } from "ai";
import OpenAI, { toFile } from "openai";
import { chatModel } from "./provider";
import { getUsageUserId } from "@/backend/billing/usageContext";
import {
  assertWithinLimit,
  recordUsage,
  reserveAiCredits,
  settleAiCreditReservation,
  UsageLimitError,
} from "@/backend/billing/limits";

const TRANSCRIPTION_MODEL = "gpt-transcribe";

/** GPT Transcribe is $0.0045/minute; one credit covers $0.001. */
const AUDIO_CREDITS_PER_MINUTE = 5;

export function audioCreditsForDuration(durationSeconds: number): number {
  return Math.max(
    1,
    Math.ceil((Math.max(0, durationSeconds) / 60) * AUDIO_CREDITS_PER_MINUTE)
  );
}

export interface TranscriptionResult {
  rawTranscript: string;
  structuredNotes: string;
  duration?: number;
  language?: string;
}

/**
 * Transcribe audio and structure it into notes using OpenAI GPT models.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  fileName: string,
  courseName?: string
): Promise<TranscriptionResult> {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    throw new Error("OpenAI audio transcription is not configured.");
  }
  const mimeType = getAudioMimeType(fileName);
  const duration = await getAudioDurationSeconds(audioBuffer, mimeType);
  const userId = getUsageUserId();
  const audioCredits = audioCreditsForDuration(duration);
  if (userId) {
    const durationCheck = await assertWithinLimit(
      userId,
      "audio_seconds",
      duration
    );
    if (!durationCheck.ok) throw new UsageLimitError(durationCheck.reason);
    await reserveAiCredits(userId, audioCredits);
  }

  // Step 1: Raw transcription with OpenAI GPT Transcribe.
  let transcription: {
    text: string;
    language?: string;
    languages?: Array<{ code?: string }>;
  };
  try {
    const openai = new OpenAI({
      apiKey: openaiApiKey,
      maxRetries: 1,
      timeout: 90_000,
    });
    const file = await toFile(audioBuffer, fileName, { type: mimeType });
    transcription = (await openai.audio.transcriptions.create({
      file,
      model: TRANSCRIPTION_MODEL,
      prompt: courseName
        ? `A class lecture for ${courseName}. Preserve technical terms, names, formulas, and assignment details.`
        : "A class lecture. Preserve technical terms, names, formulas, and assignment details.",
    })) as typeof transcription;
  } catch (error) {
    if (userId) await settleAiCreditReservation(userId, audioCredits, 0);
    throw error;
  }

  if (userId) await recordUsage(userId, "audio_seconds", duration);

  const rawTranscript = transcription.text ?? "";
  if (!rawTranscript.trim()) {
    throw new Error("OpenAI returned an empty transcript.");
  }

  // Step 2: Structure the transcript into organized lecture notes
  const { text: structuredNotes } = await generateText({
    model: chatModel,
    system: `You are an expert note-taker converting a lecture transcript into well-structured study notes.

Format the notes as:
## Lecture Overview
[2-3 sentence summary]

## Key Topics Covered
[Organized sections for each topic discussed]

## Important Terms & Definitions
[Any terms defined in the lecture]

## Examples & Explanations
[Key examples the professor gave]

## Action Items / Assignments Mentioned
[Any homework, readings, or upcoming tests mentioned]

Be concise and student-friendly. Fix transcript errors where obvious.`,
    prompt: [
      courseName ? `Course: ${courseName}` : null,
      "Transcript:",
      rawTranscript.slice(0, 25000),
    ]
      .filter(Boolean)
      .join("\n"),
    maxTokens: 3000,
  });

  return {
    rawTranscript,
    structuredNotes,
    duration,
    language: transcription.languages?.[0]?.code ?? transcription.language,
  };
}

async function getAudioDurationSeconds(
  audioBuffer: Buffer,
  mimeType: string
): Promise<number> {
  try {
    const { parseBuffer } = await import("music-metadata");
    const metadata = await parseBuffer(
      audioBuffer,
      { mimeType, size: audioBuffer.length },
      { duration: true, skipCovers: true }
    );
    const duration = Math.ceil(metadata.format.duration ?? 0);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error();
    return duration;
  } catch {
    throw new Error("The audio duration could not be determined.");
  }
}

function getAudioMimeType(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop();
  const map: Record<string, string> = {
    mp3: "audio/mpeg",
    mp4: "audio/mp4",
    m4a: "audio/mp4",
    wav: "audio/wav",
    webm: "audio/webm",
    ogg: "audio/ogg",
    mpeg: "audio/mpeg",
    mpga: "audio/mpeg",
  };
  return map[ext ?? ""] ?? "audio/mpeg";
}
