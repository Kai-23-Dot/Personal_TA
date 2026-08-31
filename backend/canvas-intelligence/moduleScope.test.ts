import { describe, expect, it } from "vitest";
import {
  buildCanvasCourseUnits,
  buildModuleAwarePageInventory,
  buildSelectedModuleFileInventory,
  extractCanvasLinkedResourceIds,
  scopeCanvasModuleGroups,
} from "./moduleScope";

describe("Canvas module-scoped inventory", () => {
  it("discovers unit pages inside one broad curriculum module", () => {
    const items = [
      "AP Human Geography Homepage",
      "Unit 1- Geography: Its Nature and Perspectives",
      "Unit 2- Population and Migration",
      "Unit 3- Cultural Patterns and Processes",
      "Unit 4- Political Organization of Space",
      "Unit 5- Agriculture and Rural Land Use",
      "Unit 6- Industrialization and Economic Development",
      "Unit 7- Cities and Urban Land Use",
    ].map((title, index) => ({
      id: 100 + index,
      module_id: 10,
      title,
      position: index + 1,
      type: "Page",
      page_url: `page-${index + 1}`,
    }));

    const units = buildCanvasCourseUnits([{
      module: {
        id: 10,
        name: "AP Human Geography Curriculum & Assignments",
        position: 1,
        items_count: items.length,
      },
      items,
    }]);

    expect(units).toHaveLength(7);
    expect(units.map((unit) => unit.moduleName)).toEqual([
      "Unit 1- Geography: Its Nature and Perspectives",
      "Unit 2- Population and Migration",
      "Unit 3- Cultural Patterns and Processes",
      "Unit 4- Political Organization of Space",
      "Unit 5- Agriculture and Rural Land Use",
      "Unit 6- Industrialization and Economic Development",
      "Unit 7- Cities and Urban Land Use",
    ]);
    expect(units[0]).toMatchObject({
      id: "canvas:10:item:101",
      moduleId: 10,
      itemCount: 1,
      moduleItemIds: [101],
    });
    expect(units.flatMap((unit) => unit.moduleItemIds)).not.toContain(100);
  });

  it("keeps an ordinary Canvas module intact", () => {
    const units = buildCanvasCourseUnits([{
      module: { id: 20, name: "Module 1: Tools Setup", position: 1, items_count: 2 },
      items: [
        { id: 201, module_id: 20, title: "Install the editor", position: 1, type: "Page" },
        { id: 202, module_id: 20, title: "Setup quiz", position: 2, type: "Quiz" },
      ],
    }]);

    expect(units).toEqual([expect.objectContaining({
      id: "canvas:20",
      moduleName: "Module 1: Tools Setup",
      moduleItemIds: [201, 202],
    })]);
  });

  it("uses repeated Canvas subheaders when numbered labels are absent", () => {
    const units = buildCanvasCourseUnits([{
      module: { id: 30, name: "Course Content" },
      items: [
        { id: 301, module_id: 30, title: "Population", position: 1, type: "SubHeader" },
        { id: 302, module_id: 30, title: "Population notes", position: 2, type: "Page" },
        { id: 303, module_id: 30, title: "Migration", position: 3, type: "SubHeader" },
        { id: 304, module_id: 30, title: "Migration slides.pptx", position: 4, type: "File" },
      ],
    }]);

    expect(units.map((unit) => unit.moduleName)).toEqual(["Population", "Migration"]);
    expect(units.map((unit) => unit.moduleItemIds)).toEqual([[302], [304]]);
    expect(units[1].powerpointCount).toBe(1);
  });

  it("stops at unit boundaries instead of fragmenting nested lessons", () => {
    const units = buildCanvasCourseUnits([{
      module: { id: 40, name: "Curriculum" },
      items: [
        { id: 401, module_id: 40, title: "Unit 1: Foundations", position: 1, indent: 0, type: "SubHeader" },
        { id: 402, module_id: 40, title: "Lesson 1: Maps", position: 2, indent: 1, type: "Page" },
        { id: 403, module_id: 40, title: "Lesson 2: Scale", position: 3, indent: 1, type: "Page" },
        { id: 404, module_id: 40, title: "Unit 2: Population", position: 4, indent: 0, type: "SubHeader" },
        { id: 405, module_id: 40, title: "Lesson 1: Density", position: 5, indent: 1, type: "Page" },
      ],
    }]);

    expect(units.map((unit) => unit.moduleName)).toEqual([
      "Unit 1: Foundations",
      "Unit 2: Population",
    ]);
    expect(units.map((unit) => unit.moduleItemIds)).toEqual([
      [402, 403],
      [405],
    ]);
  });

  it("does not mistake ordinary numbered wording for a boundary", () => {
    const units = buildCanvasCourseUnits([{
      module: { id: 50, name: "Course Materials" },
      items: [
        { id: 501, module_id: 50, title: "Unit conversion worksheet", position: 1, type: "File" },
        { id: 502, module_id: 50, title: "Module quiz review", position: 2, type: "Page" },
      ],
    }]);

    expect(units).toHaveLength(1);
    expect(units[0].moduleName).toBe("Course Materials");
  });

  it("scopes two virtual units from the same Canvas module independently", () => {
    const groups = [{
      module: { id: 60, name: "All Units" },
      items: [
        { id: 601, module_id: 60, title: "Unit 1", position: 1, type: "Page" },
        { id: 602, module_id: 60, title: "Unit 2", position: 2, type: "Page" },
      ],
    }];

    const scoped = scopeCanvasModuleGroups(groups, [
      { moduleId: 60, unitName: "Unit 2", moduleItemIds: [602] },
    ]);

    expect(scoped).toEqual([{
      module: { id: 60, name: "Unit 2" },
      items: [expect.objectContaining({ id: 602 })],
    }]);
  });

  it("finds files and assignments linked from a selected unit page", () => {
    expect(extractCanvasLinkedResourceIds(`
      <a href="/courses/9/files/701/download">Slides</a>
      <a href="https://school.instructure.com/api/v1/files/702">Notes</a>
      <a href="/courses/9/assignments/801">Quiz</a>
      <a href="/courses/9/files/701">Duplicate</a>
    `)).toEqual({ fileIds: [701, 702], assignmentIds: [801] });
  });

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
