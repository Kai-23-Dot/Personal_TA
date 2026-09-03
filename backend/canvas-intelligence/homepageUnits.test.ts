import { describe, expect, it } from "vitest";
import {
  buildCanvasHomepageUnits,
  buildCanvasPageUnits,
  countCanvasHomepageImagePageLinks,
  extractCanvasHtmlResourceLinks,
  extractCanvasImageSources,
  mergeCanvasCourseUnits,
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

  it("finds the AP Human Geography units in Canvas Rich Content Editor markup", () => {
    const unitPages = [
      ["Unit 1- Geography: Its Nature and Perspectives", "unit-1-geography-its-nature-and-perspectives"],
      ["Unit 2- Population and Migration", "unit-2-population-and-migration"],
      ["Unit 3- Cultural Patterns and Processes", "unit-3-cultural-patterns-and-processes"],
      ["Unit 4- Political Organization of Space", "unit-4-political-organization-of-space"],
      ["Unit 5- Agriculture and Rural Land Use", "unit-5-agriculture-and-rural-land-use"],
      ["Unit 6- Industrialization and Economic Development", "unit-6-industrialization-and-economic-development"],
      ["Unit 7- Cities and Urban Land Use", "unit-7-cities-and-urban-land-use"],
    ] as const;
    const pages = [
      { page_id: 1, title: "AP Human Geography Homepage", url: "ap-human-geography-homepage" },
      ...unitPages.map(([title, url], index) => ({ page_id: index + 2, title, url })),
      { page_id: 10, title: "AP Exam Review", url: "ap-exam-review" },
    ];
    const tile = (slug: string, fileId: number, alt: string) => `
      <a
        href="/courses/388438/pages/${slug}"
        data-api-endpoint="https://school.instructure.com/api/v1/courses/388438/pages/${slug}"
        data-api-returntype="Page"
      >
        <img
          src="/courses/388438/files/${fileId}/preview"
          data-api-endpoint="https://school.instructure.com/api/v1/courses/388438/files/${fileId}"
          alt="${alt}"
        >
      </a>`;
    const html = [
      tile("ap-human-geography-homepage", 100, "AP HUMAN GEOGRAPHY.png"),
      ...unitPages.map(([, slug], index) => tile(slug, 101 + index, `UNIT ${index + 1}.png`)),
      tile("ap-exam-review", 120, "Exam Review.png"),
      `<a href="/courses/388438/modules/1446777"><img src="/courses/388438/files/130/preview" alt="Class Videos.png"></a>`,
    ].join("\n");

    const units = buildCanvasHomepageUnits({
      html,
      courseId: 388438,
      domain: "school.instructure.com",
      pages,
    });

    expect(units.map((unit) => unit.moduleName)).toEqual([
      ...unitPages.map(([title]) => title.replace("- ", " ")),
      "AP Exam Review",
    ]);
    expect(units).toHaveLength(8);
  });

  it("reconstructs and groups units from Pages when front_page is unavailable", () => {
    const pageUnits = buildCanvasPageUnits([
      { page_id: 1, url: "unit-1-overview", title: "Unit 1: Geography", published: true },
      { page_id: 2, url: "unit-1-notes", title: "Unit 1 Notes", published: true },
      { page_id: 3, url: "unit-2-population", title: "Unit 2: Population", published: true },
      { page_id: 4, url: "unit-3-old", title: "Unit 3: Old", published: false },
      { page_id: 5, url: "syllabus", title: "Syllabus", published: true },
    ]);

    expect(pageUnits.map((unit) => unit.moduleName)).toEqual([
      "Unit 1: Geography",
      "Unit 2: Population",
    ]);
    expect(pageUnits[0].pageSlugs).toEqual(["unit-1-overview", "unit-1-notes"]);
  });

  it("merges Home and Pages inventory without duplicating a unit", () => {
    const homepage = buildCanvasHomepageUnits({
      html: `<a href="/courses/9/pages/unit-1-overview">Unit 1: Geography</a>`,
      courseId: 9,
    });
    const pages = buildCanvasPageUnits([
      { page_id: 1, url: "unit-1-overview", title: "Unit 1: Geography" },
      { page_id: 2, url: "unit-1-homework", title: "Unit 1 Homework" },
    ]);

    expect(mergeCanvasCourseUnits(homepage, pages)).toEqual([
      expect.objectContaining({
        moduleName: "Unit 1: Geography",
        pageSlugs: ["unit-1-overview", "unit-1-homework"],
      }),
    ]);
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
        <object data="https://school.instructure.com/api/v1/courses/42/files/402"></object>
        <a href="/courses/99/pages/wrong-course">Ignore</a>
        <img src="/courses/42/files/501/preview" alt="Worked example" width="900" height="600">
        <img src="/images/icon.png" alt="icon" width="24" height="24">
      `,
    });

    expect(links.pageSlugs).toEqual(["unit-1a-notes"]);
    expect(links.assignmentIds).toEqual([301]);
    expect(links.fileIds).toEqual([401, 402, 501]);
    expect(links.externalUrls).toEqual([
      "https://docs.google.com/presentation/d/abcdefghijk/view",
      "https://drive.google.com/file/d/lmnopqrstuv/preview",
    ]);
    expect(links.images).toEqual([{
      url: "https://school.instructure.com/courses/42/files/501/preview",
      alt: "Worked example",
      fileId: 501,
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
      fileId: 11,
    }]);
  });

  it("retains the Canvas file ID when an image src is an opaque preview URL", () => {
    expect(extractCanvasImageSources(`
      <img
        src="/images/thumbnails/show/abc123"
        data-api-endpoint="https://school.instructure.com/api/v1/courses/5/files/99"
        alt="Polynomial notes"
        width="900"
        height="600"
      >
    `, "school.instructure.com")).toEqual([{
      url: "https://school.instructure.com/images/thumbnails/show/abc123",
      alt: "Polynomial notes",
      fileId: 99,
    }]);
  });
});
