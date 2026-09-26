# Source ingestion

Conlearn's extraction capabilities live in the backend. This change adds no
upload/link-entry interface, API endpoint, or deployment.

| Source | Entry point | Behavior |
| --- | --- | --- |
| PDF bytes | `extractFileText(buffer, "pdf")` in `backend/utils/extractFileText.ts` | Extracts embedded text with PDF.js through `pdf-parse`; shared parser copies Buffer bytes to Uint8Array to avoid Buffer slice corruption. |
| Public PDF URL | `extractUrlText(url)` in `backend/utils/extractUrlText.ts` | Downloads a bounded public resource and reuses the PDF parser. |
| Public webpage | `extractUrlText(url)` | Parses HTML with parse5, prefers readable main/article content, excludes scripts/navigation/hidden elements, decodes entities, and preserves paragraph boundaries. Also accepts plain text. |
| YouTube video | `extractUrlText(url)` or `extractYoutubeText(url)` | Reads publicly available caption tracks, preferring manual English, then automatic English, then other languages. Watch, short, embed, Shorts, and live URLs are recognized. |

`extractUrlText` returns `{ text, title, sourceUrl, sourceType, language? }` and
throws an error when extraction fails. Import it only from Node/server code.
It does not persist data or invoke AI generation.

## Existing flow integration

Full Canvas sync (`POST /api/sync`, `mode: "full"`) resolves discovered website,
PDF, and YouTube links before saving notes. Existing Google Docs/Slides/Drive
handling remains available, including its OAuth support. The resolver deduplicates
URL downloads, processes at most four items concurrently and eight unique links
per course sync, and reports failed/skipped extractions in the sync errors array.
It does not save bare URLs or video metadata as extracted study material. Quick
sync does not run this content crawl. The separate live deep-fetch path retains
its existing source handling; new link text becomes available there via synced notes.

## Bounds and limitations

- PDF downloads are limited to 25 MB; HTML/plain-text responses to 5 MB.
- Public fetching accepts HTTP/HTTPS on standard ports, with no cookies or
  authentication headers. It validates public DNS addresses and pins the checked
  address for every connection and redirect; private/reserved addresses are rejected.
- Each download has a 15-second timeout. Redirects, download sizes, and YouTube
  caption fallback attempts are bounded. Unexpected compressed responses are rejected.
- Website extraction reads returned HTML; it does not execute JavaScript or
  authenticate to protected pages. A script-only page may have no extractable text.
- YouTube extraction uses the public player/caption format, which is not a stable
  API. Missing captions, restrictions, consent pages, server-side blocking, or a
  changed response format can prevent extraction. Video audio is not downloaded
  or transcribed. Unavailable transcripts fail explicitly instead of using descriptions.
- Scanned PDFs need OCR. Existing Canvas deep-fetch includes a limited PDF vision
  fallback; ordinary PDF uploads and public PDF URLs extract embedded text only.

## Verification

The test suite covers a real in-memory PDF fixture, website HTML and charset
handling, caption fixtures and unavailable videos, URL security and redirect
revalidation, and Canvas resolution with partial failures and duplicate sources.

```sh
npm test
npx tsc --noEmit --incremental false
npm run lint
npm run build
```

Parser references: [parse5 API](https://parse5.js.org/functions/parse5.parse.html)
and [yt-dlp's maintained YouTube extractor](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/youtube/_video.py).
