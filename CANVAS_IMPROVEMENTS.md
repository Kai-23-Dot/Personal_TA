# Universal Canvas Content Ingestion Strategy

## Goal

PersonalTA now treats each Canvas course as a content graph instead of a flat list of assignments, pages, and files. The crawler starts from high-value course entry points, follows links the way a student would, extracts readable study material from supported formats, ranks each resource by usefulness, and stores enough metadata for source-grounded practice tests, study guides, summaries, flashcards, and explanations.

## Current Strategy

### 1. Multi-source discovery

The ingestion engine inspects every major Canvas surface available through the current API layer:

- Course pages, including front-page metadata when Canvas marks it
- Modules and ordered module items
- Canvas files and folders
- Assignments and assignment descriptions
- Announcements
- Discussions
- Syllabus content
- Quizzes as metadata only, with an answer-leakage guard
- Calendar events
- External links, embeds, Canvas internal links, Google Drive links, and common video providers

This replaces the older strategy that primarily improved fetch reliability and text cleanup. Reliability still matters, but discovery is now graph-first.

### 2. Course content graph

Each discovered object is normalized into a `CanvasContentItem` with graph metadata:

- `sourceType` and `type`
- `sourceUrl`, `externalUrl`, and Canvas object IDs when available
- `bodyHtml`, `textContent`, and `fileText`
- module name, module position, item position, and due dates
- `discoveredFrom`, `depth`, `checksum`, and graph edges
- `confidenceScore`, `contentQualityScore`, `extractionStatus`, and `errorMessage`

Edges are stored in item metadata as `graphEdges` with relation types:

- `links_to`
- `embeds`
- `belongs_to_module`
- `attached_file`
- `external_resource`
- `derived_from`

This lets PersonalTA preserve chains like:

`Home page -> Unit 3 button -> Canvas page -> Google Slides -> PDF`

### 3. Graph traversal

The crawler starts from:

- All Canvas pages
- Assignments
- Files and folders
- Modules and module items
- Syllabus
- Announcements
- Discussions
- Quizzes
- Calendar events

For HTML content, it extracts anchors, iframes, embeds, objects, images, `data-url` style Canvas attributes, and plain external URLs. It normalizes relative Canvas URLs, classifies links, creates placeholder nodes for discovered resources, and recursively follows reachable Canvas pages and file references up to a bounded depth.

Loop protection is handled with visited page slugs, visited external URLs, per-node checksums, and a max traversal depth.

### 4. Document extraction

Canvas files are no longer indexed as metadata only when they are readable. The crawler downloads supported files and extracts text from:

- PDFs
- DOCX files
- PPTX and PowerPoint files
- Plain text and Markdown files

The extraction path uses the existing `extractFileText` helper. PowerPoint extraction preserves slide order with slide-number labels from the helper. Unsupported, inaccessible, oversized, or failed extractions remain in the graph with explicit `extractionStatus` values instead of silently disappearing.

Google Docs, Google Slides, Sheets, and generic Drive links are detected by the crawler and remain compatible with the sync route’s Google extraction fallback.

### 5. Video handling

The crawler detects common video providers and stores video nodes with metadata-only status unless a transcript extractor is added later.

Detected providers include:

- YouTube
- Vimeo
- Google Drive video
- Canvas Studio or Canvas media
- Loom
- Edpuzzle
- Panopto
- Kaltura
- Direct MP4, MOV, and WebM links

Video nodes record provider metadata and avoid claiming transcript extraction when only a link was found.

### 6. Ranking and quality signals

Every node receives a quality and confidence score. Positive signals include:

- Appears in modules
- Has module ordering context
- Title or folder includes terms like notes, slides, lecture, lesson, unit, chapter, study guide, review, packet, worksheet, reading, handout, or presentation
- Has substantial extracted educational text
- Is a Canvas page, module item, PDF, PPTX, DOCX, Google Slide, or Google Doc
- Is linked from multiple graph locations

Negative signals include:

- Administrative terms like rubric, policy, calendar, schedule, attendance, office hours, thumbnail, banner, logo, answer key, or solutions
- Unsupported extraction
- Failed extraction
- Tiny or metadata-only content

Quiz nodes are retained as scheduling and topic context only.

### 7. Indexing behavior

The existing sync route remains backward-compatible. It still consumes `crawlCanvasCourseContent()` and upserts extracted content into notes, while the crawler now supplies richer text, graph metadata, source URLs, extraction statuses, and rankings.

Downstream retrieval can use:

- module and item order for unit-aware study requests
- graph edges for source provenance
- content quality for filtering
- extraction status for user-facing transparency
- checksums for deduplication

## Key Files

- `lib/canvas-intelligence/canvasCrawler.ts`
- `lib/canvas-intelligence/types.ts`
- `lib/canvas-intelligence/contentExtractor.ts`
- `lib/canvas-intelligence/contentClassifier.ts`
- `lib/canvas-intelligence/rankingModel.ts`
- `app/api/sync/route.ts`

## Remaining Enhancements

- Add first-class transcript extractors for providers that expose captions through approved APIs.
- Persist `ContentNode` and `ContentEdge` in dedicated database tables instead of embedding graph edges in note metadata.
- Add OCR fallback for scanned PDFs and educational images.
- Use the Google Slides API directly for speaker notes, alt text, and richer slide structure.
- Add topic and unit resolver tests for requests like “Unit 3,” “Photosynthesis,” “last week’s notes,” and “current module.”
