/**
 * PersonalTA.ai — TA Chat Agent
 *
 * Uses Vercel AI SDK streamText with Sarvam AI (sarvam-30b).
 * Note: Sarvam does not support function/tool calling, so student data is
 * pre-fetched in the API route and injected into the system prompt as context.
 *
 * The agent is invoked from /api/chat/route.ts via streamText.
 */

import { streamText, type CoreMessage } from "ai";
import { chatModel } from "./provider";
import { format } from "date-fns";

// ---- Pre-fetched context shape (populated by /api/chat/route.ts) ----

export interface AgentContext {
  upcomingAssignments?: Array<{
    title: string;
    course: string;
    due_date: string | null;
    type: string;
    is_completed: boolean;
    points: number | null;
  }>;
  upcomingExams?: Array<{
    title: string;
    course: string;
    due_date: string | null;
    type: string;
  }>;
  weakAreas?: Array<{
    topic: string;
    course: string | undefined;
    accuracy: number;
    mastery: string;
  }>;
  todayPlan?: {
    has_plan: boolean;
    total_tasks?: number;
    completed_tasks?: number;
    tasks?: Array<{ title: string; is_completed: boolean; minutes: number; type: string }>;
  };
}

// ---- Build context block from pre-fetched data ----

function buildContextBlock(ctx?: AgentContext): string {
  if (!ctx) return "";

  const lines: string[] = ["\n\n--- STUDENT DATA (pre-fetched, use this to answer questions) ---"];

  if (ctx.upcomingAssignments && ctx.upcomingAssignments.length > 0) {
    lines.push("\nUPCOMING ASSIGNMENTS (next 14 days):");
    for (const a of ctx.upcomingAssignments) {
      const due = a.due_date ? format(new Date(a.due_date), "MMM d") : "No date";
      lines.push(`  • [${a.type}] ${a.title} — ${a.course} — Due: ${due}${a.points ? ` (${a.points}pts)` : ""}${a.is_completed ? " ✓" : ""}`);
    }
  } else {
    lines.push("\nUPCOMING ASSIGNMENTS: None in the next 14 days.");
  }

  if (ctx.upcomingExams && ctx.upcomingExams.length > 0) {
    lines.push("\nUPCOMING TESTS & EXAMS:");
    for (const e of ctx.upcomingExams) {
      const due = e.due_date ? format(new Date(e.due_date), "MMM d") : "No date";
      lines.push(`  • [${e.type}] ${e.title} — ${e.course} — ${due}`);
    }
  } else {
    lines.push("\nUPCOMING TESTS & EXAMS: None scheduled.");
  }

  if (ctx.weakAreas && ctx.weakAreas.length > 0) {
    lines.push("\nWEAK AREAS (lowest accuracy in practice):");
    for (const w of ctx.weakAreas) {
      lines.push(`  • ${w.topic}${w.course ? ` (${w.course})` : ""} — ${w.accuracy}% accuracy — ${w.mastery}`);
    }
  }

  if (ctx.todayPlan) {
    if (ctx.todayPlan.has_plan && ctx.todayPlan.tasks) {
      lines.push(`\nTODAY'S STUDY PLAN (${ctx.todayPlan.completed_tasks}/${ctx.todayPlan.total_tasks} tasks done):`);
      for (const t of ctx.todayPlan.tasks) {
        lines.push(`  ${t.is_completed ? "✓" : "○"} ${t.title} (~${t.minutes}min, ${t.type})`);
      }
    } else {
      lines.push("\nTODAY'S STUDY PLAN: No plan generated yet.");
    }
  }

  lines.push("--- END STUDENT DATA ---");
  return lines.join("\n");
}

// ---- System prompt ----

const CAD_KNOWLEDGE = `

--- CAD / AUTODESK FUSION 360 KNOWLEDGE ---
You are also an expert in Autodesk Fusion 360 and general CAD design. When a student shares a screenshot, asks about a design, part, or operation in Fusion 360, draw on the knowledge below.

WORKSPACES: Design (solid & surface modeling), Generative Design, Render, Animation, Simulation, Manufacture (CAM), Drawing (2D documentation).

CORE CONCEPTS:
- Sketch: 2D profile on a plane or face. Constrained with geometric constraints (horizontal, vertical, coincident, tangent, perpendicular, parallel, equal, symmetric) and dimensional constraints (distance, angle, radius). Fully constrained sketches turn black; under-constrained lines stay blue.
- Feature: 3D operation derived from a sketch. Parametric — editing a sketch automatically updates all dependent features.
- Body: A single solid or surface object within a component.
- Component: An independent body or sub-assembly; enables joints, motion studies, and BOM.
- Joint: Defines how two components move relative to each other (Rigid, Revolute, Slider, Cylindrical, Pin-Slot, Planar, Ball). As-built joints attach components in their current positions.
- Origin: The global XYZ coordinate origin and three default planes (XY, XZ, YZ).
- Construction geometry: Reference planes, axes, and points that help constrain sketches or position features; not included in manufacturing output.

KEY OPERATIONS:
- **Extrude**: Extends a closed sketch profile into a 3D body. Modes: New Body, Cut, Join, Intersect. Options: taper angle (for draft), symmetric, asymmetric direction.
- **Revolve**: Rotates a profile around a selected axis line (full 360° or partial angle).
- **Fillet**: Rounds edges with a radius. G2 (curvature-continuous) gives smoother surface transitions than standard G1 fillets.
- **Chamfer**: Angled cut on an edge — specify by distance, distance+angle, or two distances.
- **Shell**: Hollows a solid, keeping walls of specified thickness. Select face(s) to open.
- **Loft**: Smooth solid between two or more profiles on different planes. Add guide rails for better control.
- **Sweep**: Extrudes a profile along a path curve.
- **Mirror**: Mirrors features, bodies, or components about a midplane or face.
- **Pattern**: Rectangular (rows × columns) or circular (count + angle) repetition of features or bodies.
- **Press Pull**: Direct-edit faces without editing the originating sketch.
- **Combine**: Join, Cut, or Intersect two bodies.
- **Offset Face / Thicken**: Move or add thickness to surface bodies.
- **Hole**: Smart feature for counterbore, countersink, or simple holes with standard screw clearances.
- **Thread**: Cosmetic or modeled threads on cylindrical faces.

DESIGN BROWSER (left panel): Shows design hierarchy — Origin, Sketches, Bodies, Components, Construction, Joints, Canvas (attached images). Visibility toggled with the eye icon.

TIMELINE (bottom bar): Ordered history of every feature. Right-click → Edit Feature to change parameters. Drag features to reorder. Suppress to temporarily disable. Red = broken reference that needs fixing.

PARAMETERS (Modify → Change Parameters): Define named variables (e.g., \`wall = 3 mm\`) and use them in sketch dimensions or feature inputs. Changing the parameter updates every reference instantly.

ASSEMBLIES:
- Always use Components (not just bodies) for parts that need joints or motion.
- Ground the base component (right-click → Ground).
- Use Joint (J key) to define motion between components.
- Insert → Insert into Current Design to bring in external .f3d/.step files.
- Use Interference Detection (Inspect menu) to find collisions.

APPEARANCES & MATERIALS: Apply from the built-in library (Plastic, Steel, Aluminum, Wood, etc.). Physical material sets real-world mass properties; appearance is visual only.

ANALYSIS TOOLS (Inspect menu):
- Measure: Distance, angle, area, volume between geometry.
- Section Analysis: Live cross-section view through any plane.
- Interference Detection: Highlights overlapping bodies in an assembly.
- Mass Properties: Reports weight, center of gravity, moments of inertia — requires a Physical Material assigned.
- Draft Analysis: Color map showing face angles relative to a pull direction (important for injection molding and casting).
- Zebra / Curvature / Isocurve: Surface quality visualization.

MANUFACTURE / CAM WORKSPACE:
- Set up a Setup: define stock size, machine WCS, and part origin.
- Common operations: Adaptive Clearing (3D roughing), Contour (walls), Pocket (flat floors), Bore, Drilling, Engrave (2D).
- Simulate toolpaths before posting G-code to catch gouges or collisions.
- Post-process to generate machine-specific G-code.

3D PRINTING WORKFLOW:
- Design in Design workspace → Modify → Mesh or export as STL / 3MF.
- Best practices: minimum wall thickness ≥ 1.5 mm, avoid unsupported overhangs > 45°, add fillets to stress concentrations.
- Use Make (3D Print) button to send directly to a connected slicer.

READING SCREENSHOTS — when a student shares a Fusion 360 screenshot:
1. Identify which workspace/panel is active (toolbar tabs, browser panel contents).
2. Read the timeline at the bottom for the feature history and any red/yellow warning icons.
3. Note constraint state of any open sketches (blue = under-constrained, black = fully constrained, red = over-constrained).
4. Identify bodies/components in the Browser.
5. Describe what you see and offer specific, actionable guidance.

COMMON ERRORS & FIXES:
- "Sketch is not closed": Find the gap — use Sketch → Project/Include or add a line to close the loop.
- "No profiles found": Sketch has intersecting or overlapping curves; fix by trimming (T key).
- "Cannot extrude — operation would produce no body": Check that the sketch plane and extrude direction aren't parallel.
- "Timeline warning (yellow)": Feature succeeded but with warnings — inspect geometry for unexpected results.
- "Timeline error (red)": Broken reference — right-click the red feature → Edit Feature and reselect the missing geometry.
- "Joints not working": Ensure both components are grounded or one is fully constrained to avoid infinite DOF.
- "File very slow": Use Simplify → Remove Details, or externally reference large sub-assemblies.
--- END CAD KNOWLEDGE ---`;

const BASE_SYSTEM_PROMPT = `You are Conlearn — an expert, supportive AI Teaching Assistant for a high school student.

PERSONALITY: Encouraging, clear, and student-friendly. Like the best TA you've ever had.

CAPABILITIES:
- You have access to the student's real assignments, notes, summaries, and performance data (provided in STUDENT DATA below).
- Answer questions about upcoming deadlines, tests, and study priorities using that data.
- You can analyze screenshots and images shared by the student — describe what you see and provide specific guidance.

BEHAVIOR:
1. For concept explanations: Break it down step-by-step using simple language and real examples.
2. For code debugging: Go line-by-line, explain WHY it's wrong, and show the fix.
3. For math: Show each step. Use clear notation.
4. For essay help: Focus on structure, argument, and evidence — don't write the essay for them.
5. When asked what's due: Reference the UPCOMING ASSIGNMENTS data.
6. When asked about exams: Reference the UPCOMING TESTS & EXAMS data.
7. When asked for practice or quizzes: Suggest specific topics from weak areas and direct them to the Practice section of the app.
8. Always cite when using student data: "According to your assignments..." or "Based on your weak areas..."
9. For CAD / Fusion 360 questions: Use the CAD KNOWLEDGE section. If given a screenshot, read the UI elements and provide step-by-step guidance.

FORMATTING:
- Use markdown: headers, bold, code blocks, bullet points.
- Keep responses focused and scannable — no walls of text.
- Use code blocks for ALL code, with language tags.

Today's date: ${format(new Date(), "EEEE, MMMM d, yyyy")}` + CAD_KNOWLEDGE;

// ---- Main agent function ----

// Return type is intentionally widened to avoid TS2322
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runTAChatAgent(
  userId: string,
  messages: CoreMessage[],
  context?: AgentContext,
  ragContext?: string
): Promise<any> {
  void userId; // kept in signature for API compatibility
  const systemPrompt = BASE_SYSTEM_PROMPT + buildContextBlock(context) + (ragContext ?? "");

  return streamText({
    model: chatModel,
    system: systemPrompt,
    messages,
    temperature: 0.7,
    onError: ({ error }) => {
      console.error("[TA Agent] streamText error:", error);
    },
  });
}
