import type {
  CanvasFile,
  CanvasModule,
  CanvasModuleItem,
  CanvasPage,
} from "@/backend/lms/canvas";

export type CanvasModuleItemsGroup = {
  module: Pick<CanvasModule, "id" | "name"> &
    Partial<Pick<CanvasModule, "position" | "items_count">>;
  items: CanvasModuleItem[];
};

export type CanvasUnitScope = {
  moduleId: number | null;
  unitName: string;
  moduleItemIds: number[];
  /** Canvas wiki-page roots selected from a course homepage tile. */
  pageSlugs?: string[];
};

export type CanvasCourseUnit = {
  id: string;
  moduleId: number | null;
  moduleName: string;
  source: "canvas";
  itemCount: number;
  powerpointCount: number;
  assignmentIds: string[];
  noteIds: string[];
  /** Exact Canvas module items owned by this unit. */
  moduleItemIds: number[];
  /** Exact Canvas page roots owned by a homepage-defined unit. */
  pageSlugs: string[];
};

type StructuralFamily =
  | "unit"
  | "module"
  | "chapter"
  | "week"
  | "lesson"
  | "section"
  | "topic";

const STRUCTURAL_FAMILY_PRIORITY: StructuralFamily[] = [
  "unit",
  "module",
  "chapter",
  "week",
  "lesson",
  "section",
  "topic",
];

const NUMBER_WORD =
  "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty";
const STRUCTURAL_HEADING = new RegExp(
  String.raw`^[\s\p{P}\p{S}]*(?:\d+[.)]\s*)?(unit|module|chapter|week|lesson|section|topic)\s*(?:#|no\.?\s*)?(\d+(?:\.\d+)*[a-z]?|[ivxlcdm]+|${NUMBER_WORD})\b`,
  "iu"
);
const GENERIC_CONTAINER =
  /\b(curriculum|course\s*(?:content|materials?|resources?)|all\s+(?:units?|modules?)|assignments?|resources?|homepage|overview|syllabus)\b/i;
const ADMINISTRATIVE_SECTION =
  /^(?:ap\s+classroom|announcements?|citation\s+resources?|class\s+(?:information|policies)|course\s+(?:home|homepage|information|policies)|emergency\s+procedures?|getting\s+started|help|orientation|student\s+resources?|syllabus|technical\s+support|welcome)\b/i;

/** Exclude non-instructional Canvas containers from study-unit selection. */
export function isCanvasAdministrativeSectionName(value: string): boolean {
  return ADMINISTRATIVE_SECTION.test(value.trim());
}

function structuralFamily(title: string): StructuralFamily | null {
  const family = title.trim().match(STRUCTURAL_HEADING)?.[1]?.toLowerCase();
  return STRUCTURAL_FAMILY_PRIORITY.includes(family as StructuralFamily)
    ? (family as StructuralFamily)
    : null;
}

function isPowerPointModuleItem(item: CanvasModuleItem): boolean {
  const description = `${item.title} ${item.content_details?.["content-type"] ?? ""}`;
  return item.type === "File" && /(?:\.pptx?|powerpoint|presentation)/i.test(description);
}

function isContentItem(item: CanvasModuleItem): boolean {
  return item.type !== "SubHeader";
}

function orderedItems(items: CanvasModuleItem[]): CanvasModuleItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) =>
      left.item.position - right.item.position || left.index - right.index
    )
    .map(({ item }) => item);
}

function toCanvasCourseUnit(
  group: CanvasModuleItemsGroup,
  name: string,
  items: CanvasModuleItem[],
  boundaryItemId?: number
): CanvasCourseUnit {
  const contentItems = items.filter(isContentItem);
  const scopedItems = contentItems.length > 0 ? contentItems : items;
  return {
    id: boundaryItemId === undefined
      ? `canvas:${group.module.id}`
      : `canvas:${group.module.id}:item:${boundaryItemId}`,
    moduleId: group.module.id,
    moduleName: name.trim(),
    source: "canvas",
    itemCount: scopedItems.length || group.module.items_count || 0,
    powerpointCount: scopedItems.filter(isPowerPointModuleItem).length,
    assignmentIds: [],
    noteIds: [],
    moduleItemIds: scopedItems.map((item) => item.id),
    pageSlugs: [],
  };
}

/**
 * Turn Canvas' flat module/item response into the units a student actually
 * recognizes. Native modules remain units unless a broad container exposes a
 * more useful repeated structure such as Unit 1, Unit 2, ... inside it.
 *
 * Boundary selection deliberately stops at the first useful structural level:
 * Unit beats Module, Module beats Chapter, and so on. The shallowest Canvas
 * indentation at that level wins, which prevents nested lesson headings from
 * fragmenting a parent unit. Items belong to a boundary until the next sibling
 * boundary. Preamble such as a course homepage is not mixed into Unit 1.
 */
export function buildCanvasCourseUnits(
  input: CanvasModuleItemsGroup[]
): CanvasCourseUnit[] {
  return [...input]
    .sort((left, right) =>
      (left.module.position ?? 0) - (right.module.position ?? 0)
    )
    .flatMap((group) => {
      const items = orderedItems(group.items);
      const labelled = items
        .map((item, index) => ({
          item,
          index,
          family: structuralFamily(item.title),
          indent: item.indent ?? 0,
        }))
        .filter((entry) => entry.family !== null);

      let boundaries: typeof labelled = [];
      for (const family of STRUCTURAL_FAMILY_PRIORITY) {
        const familyEntries = labelled.filter((entry) => entry.family === family);
        if (familyEntries.length === 0) continue;
        const shallowestIndent = Math.min(...familyEntries.map((entry) => entry.indent));
        boundaries = familyEntries.filter((entry) => entry.indent === shallowestIndent);
        break;
      }

      const parentIsStructural = structuralFamily(group.module.name) !== null;
      const parentIsGeneric = GENERIC_CONTAINER.test(group.module.name);
      const shouldUseLabelledBoundaries =
        boundaries.length >= 2 ||
        (boundaries.length === 1 && (!parentIsStructural || parentIsGeneric));

      if (!shouldUseLabelledBoundaries) {
        const subheaders = items
          .map((item, index) => ({ item, index, family: null, indent: item.indent ?? 0 }))
          .filter((entry) => entry.item.type === "SubHeader" && entry.item.title.trim());
        if (subheaders.length >= 2) {
          const shallowestIndent = Math.min(...subheaders.map((entry) => entry.indent));
          boundaries = subheaders.filter((entry) => entry.indent === shallowestIndent);
        } else {
          return [toCanvasCourseUnit(group, group.module.name, items)];
        }
      }

      return boundaries.flatMap((boundary, boundaryIndex) => {
        const nextBoundary = boundaries[boundaryIndex + 1];
        const segment = items.slice(boundary.index, nextBoundary?.index ?? items.length);
        if (!segment.some(isContentItem)) return [];
        return [
          toCanvasCourseUnit(
            group,
            boundary.item.title,
            segment,
            boundary.item.id
          ),
        ];
      });
    });
}

/**
 * Relabel and trim live module groups to the exact synthetic units selected by
 * the client. This keeps retrieval scoped when several units share one Canvas
 * module.
 */
export function scopeCanvasModuleGroups(
  groups: CanvasModuleItemsGroup[],
  scopes: readonly CanvasUnitScope[]
): CanvasModuleItemsGroup[] {
  const byModuleId = new Map(groups.map((group) => [group.module.id, group]));
  return scopes.flatMap((scope) => {
    if (scope.moduleId === null) return [];
    const group = byModuleId.get(scope.moduleId);
    if (!group) return [];
    const itemIds = new Set(scope.moduleItemIds);
    const items = itemIds.size > 0
      ? group.items.filter((item) => itemIds.has(item.id))
      : group.items;
    return [{
      module: { ...group.module, name: scope.unitName },
      items,
    }];
  });
}

/** Extract Canvas file/assignment IDs linked from an HTML page body. */
export function extractCanvasLinkedResourceIds(html: string): {
  fileIds: number[];
  assignmentIds: number[];
} {
  const fileIds = new Set<number>();
  const assignmentIds = new Set<number>();
  const collect = (pattern: RegExp, target: Set<number>) => {
    for (const match of html.matchAll(pattern)) {
      const id = Number(match[1]);
      if (Number.isSafeInteger(id) && id > 0) target.add(id);
    }
  };
  collect(/\/(?:api\/v1\/)?(?:courses\/\d+\/)?files\/(\d+)\b/gi, fileIds);
  collect(/\/courses\/\d+\/assignments\/(\d+)\b/gi, assignmentIds);
  return { fileIds: [...fileIds], assignmentIds: [...assignmentIds] };
}

/**
 * Canvas can expose Page module items while returning an empty/404 response
 * from the course-wide Pages endpoint. Merge both inventories by page slug and
 * preserve module membership so selected-unit retrieval still works.
 */
export function buildModuleAwarePageInventory(
  coursePages: CanvasPage[],
  moduleGroups: CanvasModuleItemsGroup[]
): { pages: CanvasPage[]; pageToModule: Map<string, string> } {
  const pageToModule = new Map<string, string>();
  const pageInventory = new Map(coursePages.map((page) => [page.url, page]));

  for (const { module, items } of moduleGroups) {
    for (const item of items) {
      if (item.type !== "Page" || !item.page_url) continue;
      pageToModule.set(item.page_url, module.name);
      if (!pageInventory.has(item.page_url)) {
        pageInventory.set(item.page_url, {
          page_id: item.content_id ?? item.id,
          url: item.page_url,
          title: item.title,
          published: item.published,
        });
      }
    }
  }

  return { pages: [...pageInventory.values()], pageToModule };
}

/**
 * Canvas may forbid the course-wide Files listing but include a downloadable
 * signed URL on a selected module's File item. Merge those direct files into
 * the inventory so linked PDFs, documents, and PowerPoints can be extracted.
 */
export function buildSelectedModuleFileInventory(
  courseFiles: CanvasFile[],
  selectedModuleGroups: CanvasModuleItemsGroup[]
): CanvasFile[] {
  const fileInventory = new Map(courseFiles.map((file) => [file.id, file]));

  for (const { items } of selectedModuleGroups) {
    for (const item of items) {
      if (item.type !== "File" || !item.content_id || !item.content_details?.url) continue;
      if (fileInventory.has(item.content_id)) continue;
      const timestamp = new Date(0).toISOString();
      fileInventory.set(item.content_id, {
        id: item.content_id,
        display_name: item.title,
        filename: item.title,
        "content-type": item.content_details["content-type"],
        content_type: item.content_details["content-type"],
        size: item.content_details.size ?? 0,
        url: item.content_details.url,
        created_at: timestamp,
        updated_at: timestamp,
      });
    }
  }

  return [...fileInventory.values()];
}
