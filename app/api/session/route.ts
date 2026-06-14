import { NextResponse } from "next/server";
import { getSession, clearSession } from "@/lib/session";

/**
 * GET /api/session
 *
 * Returns the current user's session info (user info only, not tokens).
 */
export async function GET() {
  const [, session] = await getSession();

  if (!session.userInfo) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    user: session.userInfo,
  });
}

/**
 * DELETE /api/session
 *
 * Logs the user out by clearing the session.
 */
export async function DELETE() {
  const [sessionId] = await getSession();
  await clearSession(sessionId);
  return NextResponse.json({ ok: true });
}
