/**
 * GET /api/lms/status
 *
 * Returns which LMS platforms have OAuth credentials configured server-side.
 * Does NOT expose actual credential values — only boolean ready flags.
 */

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    google_classroom: !!(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ),
    canvas: !!(
      process.env.CANVAS_CLIENT_ID && process.env.CANVAS_CLIENT_SECRET
    ),
    microsoft_teams: !!(
      process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
    ),
    // IC OAuth is optional — token-based connection always works without credentials
    infinite_campus: true,
  });
}
