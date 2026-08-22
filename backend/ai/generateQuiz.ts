import { generateText } from "ai";
import { chatModel } from "./provider";
import { v4 as uuidv4 } from "uuid";
import type { Difficulty, QuizQuestion } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export interface QuizSource {
  idx: number;
  title: string;
  moduleName?: string | null;
  sourceUrl?: string | null;
}

export interface GenerateQuizOptions {
  topic: string;
  difficulty: Difficulty;
  questionCount?: number;
  context?: string;
  courseNotes?: string;
  recentMistakes?: string[];
  courseName?: string;
  isAP?: boolean;
  /** Programming language enforced for all code in this course (e.g. "Java", "Python"). */
  courseLanguage?: string;
  /** Reduce prompt/output token usage for local testing. */
  lowTokenMode?: boolean;
  /**
   * Representative course content used for style inference when no topic-specific
   * notes were found. Questions will match the depth and terminology of this class
   * even without dedicated notes for the topic.
   */
  styleHint?: string;
  /**
   * Source list corresponding to the courseNotes sections (0-indexed).
   * When provided, the LLM will be asked to cite which source each question came from.
   */
  sources?: QuizSource[];
}

const rawQuestionSchema = z.object({
  question: z.string().trim().min(5).max(10_000),
  type: z.enum(["multiple_choice", "true_false", "short_answer"]),
  options: z.array(z.string().max(4_000)).max(10).optional(),
  correct_answer: z.string().trim().min(1).max(4_000),
  explanation: z.string().trim().min(1).max(10_000),
  topic: z.string().trim().min(1).max(300),
  difficulty: z.enum(["easy", "medium", "hard"]),
  source_idx: z.number().int().nonnegative().optional(),
});

const rawQuizEnvelopeSchema = z.object({
  // Validate each question independently below. A single malformed model item
  // must not cause the entire otherwise-valid quiz envelope to be discarded.
  questions: z.array(z.unknown()).max(100),
});

type QuizValidationOptions = {
  courseLanguage?: string;
  questionCount: number;
  sourceCount?: number;
  topic: string;
};

function extractQuizEnvelope(text: string): unknown {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Quiz generation failed: no JSON object in response");
  }

  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    throw new Error("Quiz generation failed: could not parse AI response as JSON");
  }
}

export function normalizeGeneratedQuizQuestions(
  raw: unknown,
  options: QuizValidationOptions
): QuizQuestion[] {
  const parsed = rawQuizEnvelopeSchema.safeParse(raw);
  if (!parsed.success) return [];

  const danglingReference =
    /\b(the given|the above|the following|this)\s+(function|code|algorithm|method|example|snippet|program|class|implementation)\b/i;
  const logisticsQuestion =
    /\b(time\s*limit|how\s+long\s+(is|does|will|do|it\s+take)|how\s+many\s+(question|point|minute|attempt)|point\s*(value|worth)|due\s*(date|time)\b|when\s+is\s+(the|this)\s+(quiz|test|exam|assignment|due)|how\s+to\s+submit|submission\s*(policy|method|format)|how\s+much\s+time|allott?ed\s+time|attempt\s+limit|allowed\s+attempts?|retake|late\s+(submission|work|policy|penalty)|grading\s+(policy|scale|rubric)|office\s+hours|extra\s+credit|when\s+(is|are)\s+(it|they|the)\s+due|number\s+of\s+questions?\s+in\s+(this|the)|what\s+is\s+the\s+(time|point|question|attempt))\b/i;
  const wrongLanguagePattern = options.courseLanguage
    ? new RegExp(
        "```(?!" +
          options.courseLanguage.toLowerCase().replace(/\s+/g, "") +
          "|pseudocode|text)[a-z+#]+",
        "i"
      )
    : null;
  const seenQuestions = new Set<string>();
  const normalized: QuizQuestion[] = [];

  for (const rawQuestion of parsed.data.questions) {
    const parsedQuestion = rawQuestionSchema.safeParse(rawQuestion);
    if (!parsedQuestion.success) continue;
    const question = parsedQuestion.data;
    if (
      question.topic.localeCompare(options.topic, undefined, {
        sensitivity: "accent",
      }) !== 0 ||
      (danglingReference.test(question.question) && !question.question.includes("```")) ||
      logisticsQuestion.test(question.question) ||
      (wrongLanguagePattern?.test(question.question) ?? false)
    ) {
      continue;
    }

    const questionKey = question.question.replace(/\s+/g, " ").trim().toLowerCase();
    if (seenQuestions.has(questionKey)) continue;

    const uniqueOptions = Array.from(
      new Map(
        (question.options ?? [])
          .map((value) => value.trim())
          .filter(Boolean)
          .map((value) => [value.toLowerCase(), value])
      ).values()
    );
    let correctAnswer = question.correct_answer.trim();

    if (/^[A-D]$/i.test(correctAnswer)) {
      correctAnswer =
        uniqueOptions[correctAnswer.toUpperCase().charCodeAt(0) - 65] ?? "";
    }

    let finalOptions: string[] | undefined;
    if (question.type === "true_false") {
      if (/^(true|t)$/i.test(correctAnswer)) correctAnswer = "True";
      else if (/^(false|f)$/i.test(correctAnswer)) correctAnswer = "False";
      else continue;
      finalOptions = ["True", "False"];
    } else if (question.type === "multiple_choice") {
      const correctOption = uniqueOptions.find(
        (value) => value.toLowerCase() === correctAnswer.toLowerCase()
      );
      if (!correctOption || uniqueOptions.length < 4) continue;
      correctAnswer = correctOption;
      finalOptions = uniqueOptions.slice(0, 4);
      if (!finalOptions.includes(correctOption)) {
        finalOptions = [...uniqueOptions.slice(0, 3), correctOption];
      }
    }

    const sourceIndex =
      typeof question.source_idx === "number" &&
      question.source_idx < (options.sourceCount ?? 0)
        ? question.source_idx
        : undefined;
    if ((options.sourceCount ?? 0) > 0 && sourceIndex === undefined) continue;

    seenQuestions.add(questionKey);
    normalized.push({
      id: uuidv4(),
      question: question.question,
      type: question.type,
      ...(finalOptions ? { options: finalOptions } : {}),
      correct_answer: correctAnswer,
      explanation: question.explanation,
      topic: options.topic,
      difficulty: question.difficulty,
      ...(sourceIndex === undefined ? {} : { source_idx: sourceIndex }),
    } as QuizQuestion);
    if (normalized.length >= options.questionCount) break;
  }

  return normalized;
}

// ---- Difficulty instruction builders ----

function apDifficultyInstruction(difficulty: Difficulty, topic: string, hasNotes: boolean): string {
  switch (difficulty) {
    case "hard":
      return [
        `DIFFICULTY: AP EXAM LEVEL (hard)`,
        `These questions must match the rigor of the College Board AP exam for this subject.`,
        `Requirements:`,
        `- Multi-step reasoning — answers cannot be looked up directly; students must synthesize concepts`,
        `- Use precise AP exam terminology and phrasing`,
        `- Include scenario-based and application questions (not just recall)`,
        `- Short answer questions should require the student to explain or derive, not just name`,
        `- Difficulty must be genuinely hard — the kind that separates 4s from 5s on the AP exam`,
      ].join("\n");

    case "medium":
      return [
        `DIFFICULTY: IN-CLASS TEST LEVEL (medium)`,
        `These questions should match the difficulty of actual tests and quizzes this teacher gives in class.`,
        hasNotes
          ? `Use the class notes as your primary source — model the question style, terminology, and depth that the teacher uses.`
          : `Use standard in-class test difficulty for this AP course — challenging but fair, matching what a teacher would put on a unit test.`,
        `- Mix of recall, comprehension, and some application`,
        `- Phrasing should feel like it came from this class, not a generic textbook`,
      ].join("\n");

    case "easy":
      return [
        `DIFFICULTY: BELOW AVERAGE (easy)`,
        `These questions should be simpler than what would appear on a class test — good for checking foundational understanding.`,
        `- Focus on definitions, direct recall, and basic concept identification`,
        `- A student who has read the notes once should be able to answer most of these`,
      ].join("\n");

    default: // adaptive
      return [
        `DIFFICULTY: ADAPTIVE — mix of easy, medium, and hard AP-level questions.`,
        `Include 1-2 easy (foundational), 2 medium (in-class test level), and 1-2 hard (AP exam level) questions.`,
      ].join("\n");
  }
}

function standardDifficultyInstruction(difficulty: Difficulty, hasNotes: boolean): string {
  const source = hasNotes
    ? `Base ALL questions on the class notes provided — questions must come directly from content covered in those notes.`
    : `Base questions on standard curriculum for this topic.`;

  switch (difficulty) {
    case "hard":
      return [
        `DIFFICULTY: CHALLENGING (hard)`,
        source,
        `- Application and analysis questions — not just recall`,
        `- Students must understand the "why", not just the "what"`,
        `- Combine multiple concepts from the notes where possible`,
      ].join("\n");

    case "medium":
      return [
        `DIFFICULTY: STANDARD (medium)`,
        source,
        `- Test comprehension and understanding of the main concepts`,
        `- Match the kind of questions a teacher would put on a typical quiz`,
        `- Mix of recall, interpretation, and basic application`,
      ].join("\n");

    case "easy":
      return [
        `DIFFICULTY: FOUNDATIONAL (easy)`,
        source,
        `- Focus on definitions, key terms, and basic facts from the notes`,
        `- A student who attended class should be able to answer these`,
        `- Questions slightly below average test difficulty`,
      ].join("\n");

    default: // adaptive
      return [
        `DIFFICULTY: ADAPTIVE — mix of easy, medium, and hard questions.`,
        source,
      ].join("\n");
  }
}

// ---- Main generator ----

export async function generateQuiz(options: GenerateQuizOptions): Promise<QuizQuestion[]> {
  const {
    topic,
    difficulty,
    questionCount = 5,
    context,
    courseNotes,
    recentMistakes = [],
    courseName,
    isAP = false,
    courseLanguage,
    lowTokenMode = false,
    styleHint,
    sources,
  } = options;

  const hasNotes = !!courseNotes;

  const difficultyBlock = isAP
    ? apDifficultyInstruction(difficulty, topic, hasNotes)
    : standardDifficultyInstruction(difficulty, hasNotes);

  // Request a small buffer so the model's tendency to fall short still yields the exact count needed.
  const requestCount = questionCount + 3;

  const prompt = [
    `You are a quiz generator for a high school student study app.`,
    ``,
    `CRITICAL REQUIREMENT: Every single question MUST be about the topic below. Do NOT generate questions about any other subject.`,
    `TOPIC: "${topic}"`,
    ``,
    `⛔ ABSOLUTE PROHIBITION — NEVER generate questions about ANY of the following:`,
    `- Quiz or test logistics: time limits, how long an assessment takes, number of questions, point values, when it's due, how to submit`,
    `- Administrative or course management info: attendance, grading policy, late submission rules, office hours, course schedule`,
    `- The structure of an assessment ("this quiz has 20 questions") or metadata about Canvas items`,
    `- Anything about HOW an assessment is administered — only ask about WHAT the student should have LEARNED`,
    `Every question must test the student's knowledge of the SUBJECT MATTER, not knowledge about how the class is run.`,
    courseName ? `COURSE: ${courseName}${isAP ? " (AP COURSE)" : ""}` : null,
    courseLanguage
      ? [
          ``,
          `⚠️ LANGUAGE ENFORCEMENT — THIS IS MANDATORY:`,
          `This course uses ${courseLanguage}. Every single code example, function, snippet, pseudocode, and syntax reference in EVERY question, option, and explanation MUST be written in ${courseLanguage}.`,
          `NEVER use Python, JavaScript, C++, or any other language. If you write code in any language other than ${courseLanguage}, the question is WRONG and will be rejected.`,
          `Use the ${courseLanguage} fenced code block tag: \`\`\`${courseLanguage.toLowerCase().replace(/\s+/g, "")}`,
        ].join("\n")
      : null,
    ``,
    difficultyBlock,
    ``,
    `YOU MUST generate EXACTLY ${requestCount} questions about "${topic}". Do not stop early. All ${requestCount} questions must directly test knowledge of "${topic}".`,
    `Question types: mostly multiple_choice (4 distinct answer options), some true_false, optionally 1 short_answer.`,
    recentMistakes.length > 0
      ? `The student has struggled with: ${recentMistakes.slice(0, 5).join(", ")} — include questions targeting these weak areas if they relate to "${topic}".`
      : null,
    courseNotes
      ? `\n=== CLASS NOTES & MATERIALS ===\n${courseNotes.slice(0, lowTokenMode ? 5000 : 14000)}\n=== END NOTES ===\n${
          isAP && difficulty === "medium"
            ? `Generate questions that mirror the style, terminology, and depth of what THIS teacher covers — as if this were an actual test from this class.`
            : !isAP
            ? `ALL questions must be based on the content in these notes. Do not introduce concepts not present in the notes.`
            : `Use these notes as supplementary context for generating AP-level questions on "${topic}".`
        }`
      : null,
    sources && sources.length > 0
      ? [
          ``,
          `=== SOURCE INDEX ===`,
          `The notes above are divided into ${sources.length} numbered source(s). For each question you generate, add a "source_idx" field (integer, 0-based) indicating which source the question was primarily derived from.`,
          ...sources.map((s) => `  [${s.idx}] ${s.title}${s.moduleName ? ` (${s.moduleName})` : ""}`),
          `=== END SOURCE INDEX ===`,
        ].join("\n")
      : null,
    context && !courseNotes ? `\nAdditional context:\n${context.slice(0, 6000)}` : null,
    styleHint && !courseNotes
      ? [
          ``,
          `NOTE: No class notes were found specifically for "${topic}".`,
          `Below is a sample of how content is structured in this course. Generate questions`,
          `that match the same depth, terminology, and style as this class — as if the teacher`,
          `were testing students who have studied this topic in class:`,
          ``,
          `=== COURSE STYLE REFERENCE ===`,
          styleHint.slice(0, lowTokenMode ? 2000 : 5000),
          `=== END REFERENCE ===`,
        ].join("\n")
      : null,
    ``,
    `FORMATTING RULES FOR QUESTION TEXT:
- If a question includes code (functions, pseudocode, algorithms, syntax examples), wrap it in a markdown fenced code block with the appropriate language tag.${
  courseLanguage
    ? `\n- ⚠️ ALL code blocks MUST use \`\`\`${courseLanguage.toLowerCase().replace(/\s+/g, "")} — this course uses ${courseLanguage} ONLY. Never write Python, JavaScript, or any other language.`
    : "\n- Use \\`\\`\\`java, \\`\\`\\`python, \\`\\`\\`javascript, \\`\\`\\`cpp, \\`\\`\\`pseudocode, etc. as appropriate."
}
- Example for a question with code:
  "question": "Given the following function:\\n\\n\`\`\`${courseLanguage ? courseLanguage.toLowerCase().replace(/\s+/g, "") : "java"}\\n${courseLanguage === "Java" || !courseLanguage ? "public static int fib(int n) {\\n    if (n <= 1) return n;\\n    return fib(n-1) + fib(n-2);\\n}" : "def fib(n):\\n    if n <= 1:\\n        return n\\n    return fib(n-1) + fib(n-2)"}\\n\`\`\`\\n\\nWhat is the time complexity of this implementation?"
- For inline code references (variable names, short expressions), use single backticks: \`n\`, \`return\`, \`O(n^2)\`.
- For math expressions, use plain text notation: O(n^2), O(2^n), sqrt(n).
- The "explanation" field may also use code blocks to show correct implementations or step-by-step working.
- Plain English parts of the question should NOT be in code blocks.
- CRITICAL: Every question must be 100% self-contained. NEVER write phrases like "the given function", "the above code", "the following example", or "this algorithm" unless the actual code/example is embedded directly inside the question field using a fenced code block. If you want to ask about a specific function, you MUST include the full function code in the question using a fenced code block.

Return ONLY a valid JSON object — no outer markdown fences, no extra text before or after. Use this exact format:
{
  "questions": [
    {
      "question": "What is a base case in recursion?",
      "type": "multiple_choice",
      "options": ["The first recursive call", "The condition that stops recursion", "The return value", "The function name"],
      "correct_answer": "The condition that stops recursion",
      "explanation": "A base case is a condition that terminates the recursion to prevent infinite loops.",
      "topic": "${topic}",
      "difficulty": "easy",
      "source_idx": 0
    }
  ]
}
Rules: type must be "multiple_choice", "true_false", or "short_answer". For true_false use options ["True","False"]. For short_answer omit options. difficulty per question must be "easy", "medium", or "hard". source_idx is an integer (0-based index into the source list provided); omit if no sources were provided.`,
  ]
    .filter(Boolean)
    .join("\n");

  const { text } = await generateText({
    model: chatModel,
    prompt,
    maxTokens: lowTokenMode ? 3200 : 16000,
  });

  const validationOptions: QuizValidationOptions = {
    courseLanguage,
    questionCount,
    sourceCount: sources?.length ?? 0,
    topic,
  };
  let normalized = normalizeGeneratedQuizQuestions(
    extractQuizEnvelope(text),
    validationOptions
  );

  if (normalized.length < questionCount) {
    const missing = questionCount - normalized.length;
    const existingStems = normalized
      .map((question) => question.question.slice(0, 240))
      .join("\n- ");
    const { text: repairText } = await generateText({
      model: chatModel,
      prompt: `${prompt}

REPAIR PASS: The prior response did not contain enough valid, distinct questions.
Return exactly ${missing} NEW replacement questions in the same JSON format.
Do not repeat any of these accepted question stems:
- ${existingStems || "(none)"}`,
      maxTokens: lowTokenMode ? 2400 : 8000,
    });
    const replacements = normalizeGeneratedQuizQuestions(
      extractQuizEnvelope(repairText),
      { ...validationOptions, questionCount: missing }
    );
    const existingKeys = new Set(
      normalized.map((question) =>
        question.question.replace(/\s+/g, " ").trim().toLowerCase()
      )
    );
    normalized = [
      ...normalized,
      ...replacements.filter(
        (question) =>
          !existingKeys.has(
            question.question.replace(/\s+/g, " ").trim().toLowerCase()
          )
      ),
    ].slice(0, questionCount);
  }

  if (normalized.length !== questionCount) {
    throw new Error(
      `Quiz generation failed validation: expected ${questionCount} questions but received ${normalized.length}.`
    );
  }

  return normalized;
}

/** Upsert a student's performance metric for a topic after a practice session. */
export async function updatePerformanceMetrics(
  supabase: SupabaseClient,
  userId: string,
  courseId: string | null,
  topic: string,
  correct: number,
  total: number
): Promise<void> {
  const { error } = await supabase.rpc("record_performance_metric", {
    metric_user_id: userId,
    metric_course_id: courseId,
    metric_topic: topic,
    session_correct: correct,
    session_total: total,
  });

  if (error) {
    console.error("Failed to upsert performance metrics:", error);
  }
}
