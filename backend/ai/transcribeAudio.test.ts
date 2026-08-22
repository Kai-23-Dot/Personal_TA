import { describe, expect, it } from "vitest";
import { audioCreditsForDuration } from "./transcribeAudio";

describe("audio transcription credits", () => {
  it("rounds GPT Transcribe cost up to whole credits", () => {
    expect(audioCreditsForDuration(1)).toBe(1);
    expect(audioCreditsForDuration(60)).toBe(5);
    expect(audioCreditsForDuration(61)).toBe(6);
    expect(audioCreditsForDuration(600)).toBe(50);
  });

  it("never returns a non-positive charge", () => {
    expect(audioCreditsForDuration(0)).toBe(1);
    expect(audioCreditsForDuration(-60)).toBe(1);
  });
});
