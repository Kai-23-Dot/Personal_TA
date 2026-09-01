import { describe, expect, it } from "vitest";
import {
  buildCanvasHomepageUnits,
  countCanvasHomepageImagePageLinks,
  extractCanvasHtmlResourceLinks,
  extractCanvasImageSources,
} from "./homepageUnits";

describe("Canvas homepage unit discovery", () => {
  it("finds image-tile math units from their destination Canvas Page titles", () => {
    const titles = [
      "Unit 1A",
      "Unit 1B",
      "Unit 2A",
      "Unit 2B",
      "Unit 3A",
      "Unit 3B",
      "Unit 3C",
      "AP Exam Review Materials",
      "Unit 4",
    ];
    const pages = titles.map((title, index) => ({
      page_id: 500 + index,
      url: title.toLowerCase().replace(/\s+/g, "-"),
      title,
    }));
    const html = `<table><tbody>${pages.map((page, index) => `
      <td>
        <a href="/courses/77/pages/${page.url}" data-api-returntype="Page">
          <img src="/courses/77/files/${900 + index}/preview" alt="" width="380" height="380">
        </a>
      </td>`).join("")}</tbody></table>`;

    const units = buildCanvasHomepageUnits({ html, courseId: 77, pages });

    expect(units.map((unit) => unit.moduleName)).toEqual(titles);
    expect(countCanvasHomepageImagePageLinks({ html, courseId: 77 })).toBe(9);
    expect(units[0]).toMatchObject({
      id: "canvas-page:unit-1a",
      moduleId: null,
      source: "canvas",
      pageSlugs: ["unit-1a"],
      moduleItemIds: [],
    });
  });

  it("uses image alt text and Canvas file names when the Pages list is hidden", () => {
    const html = `
      <a href="/courses/88/pages/first"><img alt="Unit 1A" src="/courses/88/files/701/preview"></a>
      <a href="/courses/88/pages/second"><img alt="" src="/courses/88/files/702/preview"></a>
      <a href="/courses/88/pages/home"><img alt="Course Home" src="/courses/88/files/703/preview"></a>`;

    const units = buildCanvasHomepageUnits({
      html,
      courseId: 88,
      files: [{
        id: 702,
        display_name: "Unit 1B.png",
        filename: "Unit 1B.png",
        size: 1,
        url: "https://school.instructure.com/files/702/download",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      }],
    });

    expect(units.map((unit) => unit.moduleName)).toEqual(["Unit 1A", "Unit 1B"]);
    expect(units.map((unit) => unit.pageSlugs)).toEqual([["first"], ["second"]]);
  });

  it("accepts a batched vision label only when deterministic tile metadata is absent", () => {
    const units = buildCanvasHomepageUnits({
      html: `<a href="/courses/91/pages/content-abc"><img alt="" src="/courses/91/files/800/preview"></a>`,
      courseId: 91,
      visionLabelsByPageSlug: new Map([["content-abc", "Unit 5B"]]),
    });

    expect(units).toEqual([
      expect.objectContaining({
        moduleName: "Unit 5B",
        pageSlugs: ["content-abc"],
      }),
    ]);
  });

  it("extracts same-course pages, assignments, files, Google material, and images", () => {
    const links = extractCanvasHtmlResourceLinks({
      courseId: 42,
      domain: "school.instructure.com",
      html: `
        <a href="/courses/42/pages/unit-1a-notes">Notes</a>
        <a data-api-endpoint="https://school.instructure.com/api/v1/courses/42/assignments/301" href="#">Homework</a>
        <a href="/courses/42/files/401/download">Worksheet</a>
        <a href="https://docs.google.com/presentation/d/abcdefghijk/view">Slides</a>
        <iframe src="https://drive.google.com/file/d/lmnopqrstuv/preview"></iframe>
        <a href="/courses/99/pages/wrong-course">Ignore</a>
        <img src="/courses/42/files/501/preview" alt="Worked example" width="900" height="600">
        <img src="/images/icon.png" alt="icon" width="24" height="24">
      `,
    });

    expect(links.pageSlugs).toEqual(["unit-1a-notes"]);
    expect(links.assignmentIds).toEqual([301]);
    expect(links.fileIds).toEqual([401]);
    expect(links.externalUrls).toEqual([
      "https://docs.google.com/presentation/d/abcdefghijk/view",
      "https://drive.google.com/file/d/lmnopqrstuv/preview",
    ]);
    expect(links.images).toEqual([{
      url: "https://school.instructure.com/courses/42/files/501/preview",
      alt: "Worked example",
    }]);
  });

  it("deduplicates repeated images and rejects off-domain sources", () => {
    expect(extractCanvasImageSources(`
      <img src="/courses/5/files/11/preview" alt="Page one">
      <img src="/courses/5/files/11/preview" alt="Duplicate">
      <img src="https://tracker.example.com/pixel.png" alt="Tracking">
    `, "school.instructure.com")).toEqual([{
      url: "https://school.instructure.com/courses/5/files/11/preview",
      alt: "Page one",
    }]);
  });
});
