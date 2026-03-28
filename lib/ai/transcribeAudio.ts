/**
 * Audio lecture transcription using Sarvam Saaras v3 ASR.
 *
 * Step 1: raw transcription via Sarvam's dedicated speech-to-text endpoint
 *         (POST https://api.sarvam.ai/speech-to-text, multipart/form-data)
 * Step 2: structuring pass via sarvam-m chat model (generateText)
 *
 * Supported formats: mp3, mp4, m4a, wav, webm, ogg
 * Max file size: 25 MB per request.
 */
import { generateText } from "ai";
import { chatModel } from "./provider";

export interface TranscriptionResult {
  rawTranscript: string;
  structuredNotes: string;
  duration?: number;
  language?: string;
}

/**
 * Transcribe audio and structure into notes using Sarvam.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  fileName: string,
  courseName?: string
): Promise<TranscriptionResult> {
  const mimeType = getAudioMimeType(fileName);

  // Step 1: Raw transcription via Sarvam Saaras v3 ASR
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
  formData.append("file", blob, fileName);
  formData.append("model", "saaras:v3");

  const asr = await fetch("https://api.sarvam.ai/speech-to-text", {
    method: "POST",
    headers: {
      "api-subscription-key": process.env.SARVAM_API_KEY ?? "",
    },
    body: formData,
  });

  if (!asr.ok) {
    throw new Error(`Sarvam ASR error ${asr.status}: ${await asr.text()}`);
  }

  const asrData = await asr.json() as { transcript?: string; language_code?: string };
  const rawTranscript = asrData.transcript ?? "";

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
    language: asrData.language_code,
  };
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
