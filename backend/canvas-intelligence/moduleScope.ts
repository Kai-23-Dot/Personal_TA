import type {
  CanvasFile,
  CanvasModule,
  CanvasModuleItem,
  CanvasPage,
} from "@/backend/lms/canvas";

export type CanvasModuleItemsGroup = {
  module: Pick<CanvasModule, "id" | "name">;
  items: CanvasModuleItem[];
};

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
