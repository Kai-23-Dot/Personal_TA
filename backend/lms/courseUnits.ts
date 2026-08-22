export type CourseUnitMaterial = {
  id: string;
  kind: "assignment" | "note";
  title: string;
  dueAt?: string | null;
  unitName?: string | null;
  fileType?: string | null;
};

export type GeneratedCourseUnit = {
  id: string;
  moduleId: null;
  moduleName: string;
  source: "generated";
  itemCount: number;
  powerpointCount: number;
  assignmentIds: string[];
  noteIds: string[];
};

const STRUCTURAL_LABEL = /\b(unit|module|chapter|week|lesson)\s*([0-9]+[a-z]?)\b/i;
const GENERATED_UNIT_SIZE = 8;

function normalizedStructuralLabel(material: CourseUnitMaterial): string | null {
  const explicit = material.unitName?.trim();
  if (explicit) return explicit;

  const match = material.title.match(STRUCTURAL_LABEL);
  if (!match) return null;
  const kind = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
  return `${kind} ${match[2].toUpperCase()}`;
}

function mondayForDate(isoDate: string): Date | null {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.getUTCDay();
  const distanceFromMonday = day === 0 ? 6 : day - 1;
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - distanceFromMonday);
  return date;
}

function weekLabel(isoDate: string): string | null {
  const monday = mondayForDate(isoDate);
  if (!monday) return null;
  return `Week of ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(monday)}`;
}

function isPowerPoint(material: CourseUnitMaterial): boolean {
  return material.fileType === "pptx" || /(?:\.pptx?|powerpoint|presentation)\b/i.test(material.title);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "course-materials";
}

function toUnit(
  label: string,
  materials: CourseUnitMaterial[],
  index: number
): GeneratedCourseUnit {
  return {
    id: `generated:${index + 1}:${slug(label)}`,
    moduleId: null,
    moduleName: label,
    source: "generated",
    itemCount: materials.length,
    powerpointCount: materials.filter(isPowerPoint).length,
    assignmentIds: materials.filter((item) => item.kind === "assignment").map((item) => item.id),
    noteIds: materials.filter((item) => item.kind === "note").map((item) => item.id),
  };
}

/**
 * Build a stable unit structure for LMS/manual courses that do not expose
 * modules. Explicit Unit/Module/Chapter labels win, dated work is grouped by
 * week, and undated material is split into manageable course-material units.
 */
export function buildGeneratedCourseUnits(
  input: CourseUnitMaterial[]
): GeneratedCourseUnit[] {
  const materials = [...input].sort((left, right) => {
    const leftTime = left.dueAt ? new Date(left.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const rightTime = right.dueAt ? new Date(right.dueAt).getTime() : Number.POSITIVE_INFINITY;
    if (leftTime !== rightTime) return leftTime - rightTime;
    return left.title.localeCompare(right.title);
  });

  if (materials.length === 0) {
    return [toUnit("Course Materials", [], 0)];
  }

  const grouped = new Map<string, CourseUnitMaterial[]>();
  const ungrouped: CourseUnitMaterial[] = [];

  for (const material of materials) {
    const label = normalizedStructuralLabel(material) ?? (material.dueAt ? weekLabel(material.dueAt) : null);
    if (!label) {
      ungrouped.push(material);
      continue;
    }
    grouped.set(label, [...(grouped.get(label) ?? []), material]);
  }

  const groups = [...grouped.entries()];
  for (let offset = 0; offset < ungrouped.length; offset += GENERATED_UNIT_SIZE) {
    const chunk = ungrouped.slice(offset, offset + GENERATED_UNIT_SIZE);
    const label = groups.length === 0 && ungrouped.length <= GENERATED_UNIT_SIZE
      ? "Course Materials"
      : `Course Materials ${Math.floor(offset / GENERATED_UNIT_SIZE) + 1}`;
    groups.push([label, chunk]);
  }

  return groups.map(([label, groupMaterials], index) => toUnit(label, groupMaterials, index));
}
