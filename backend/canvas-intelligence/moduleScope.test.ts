import { describe, expect, it } from "vitest";
import {
  buildModuleAwarePageInventory,
  buildSelectedModuleFileInventory,
} from "./moduleScope";

describe("Canvas module-scoped inventory", () => {
  it("uses module Page items when the course-wide Pages endpoint is empty", () => {
    const result = buildModuleAwarePageInventory([], [{
      module: { id: 10, name: "Module 1: Tools Setup" },
      items: [{
        id: 101,
        module_id: 10,
        title: "Module 1 Learning Materials",
        position: 1,
        type: "Page",
        page_url: "module-1-learning-materials",
      }],
    }]);

    expect(result.pages).toEqual([expect.objectContaining({
      page_id: 101,
      url: "module-1-learning-materials",
      title: "Module 1 Learning Materials",
    })]);
    expect(result.pageToModule.get("module-1-learning-materials")).toBe("Module 1: Tools Setup");
  });

  it("uses a selected module file URL when the Files endpoint is forbidden", () => {
    const files = buildSelectedModuleFileInventory([], [{
      module: { id: 10, name: "Module 1" },
      items: [{
        id: 202,
        module_id: 10,
        content_id: 303,
        title: "Lecture deck.pptx",
        position: 1,
        type: "File",
        content_details: {
          "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          size: 2048,
          url: "https://school.instructure.com/files/303/download",
        },
      }],
    }]);

    expect(files).toEqual([expect.objectContaining({
      id: 303,
      display_name: "Lecture deck.pptx",
      url: "https://school.instructure.com/files/303/download",
    })]);
  });
});
