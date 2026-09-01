import { z } from "zod";

const optionalUuidSchema = z.preprocess(
  (value) =>
    value === null || (typeof value === "string" && value.trim() === "")
      ? undefined
      : value,
  z.string().trim().uuid().optional()
);

const optionalTopicSchema = z.preprocess(
  (value) =>
    value === null || (typeof value === "string" && value.trim() === "")
      ? undefined
      : value,
  z.string().trim().min(1).max(200).optional()
);

const flashcardUnitSchema = z.object({
  moduleId: z.number().int().positive().nullable(),
  moduleName: z.string().trim().min(1).max(300),
  source: z.enum(["canvas", "generated"]),
  assignmentIds: z.array(z.string().uuid()).max(100),
  noteIds: z.array(z.string().uuid()).max(100),
  moduleItemIds: z.array(z.number().int().positive()).max(500).optional().default([]),
}).strict();

/**
 * Accept null and empty legacy values at the HTTP boundary, then normalize them
 * to the optional values used internally. Current clients omit these fields.
 */
export const flashcardGenerationSchema = z.object({
  noteId: optionalUuidSchema,
  noteIds: z.array(z.string().uuid()).max(100).optional(),
  courseId: optionalUuidSchema,
  topic: optionalTopicSchema,
  units: z.array(flashcardUnitSchema).min(1).max(12).optional(),
  count: z.preprocess(
    (value) => value === null ? undefined : value,
    z.number().int().min(1).max(30).default(10)
  ),
  difficulty: z.preprocess(
    (value) => value === null || value === "" ? undefined : value,
    z.enum(["easy", "medium", "hard", "mixed"]).default("mixed")
  ),
}).strict().superRefine((value, context) => {
  const hasSelectedContent = Boolean(
    value.noteId || value.noteIds?.length || value.units?.length
  );
  if (!hasSelectedContent && !value.courseId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select a course or note to generate flashcards.",
    });
  }
  if ((value.noteIds?.length || value.units?.length) && !value.courseId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A course is required for selected notes or units.",
    });
  }
});
