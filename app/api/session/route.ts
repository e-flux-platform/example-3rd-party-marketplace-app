import { NextResponse } from "next/server";
import { getSession, clearSession } from "@/lib/session";
import { isPreregisteredConfigured } from "@/lib/oauth";
import { readRegistration, toPublicRegistration } from "@/lib/registration-store";

/**
 * GET /api/session
 *
 * Returns the auth state plus everything the home page needs to render both
 * mode cards: whether preregistered credentials are configured, and the public
 * view of any stored dynamic registration (no management token). When
 * authenticated, also returns the mode that session logged in with.
 * Reading the store does not trigger a registration.
 */
export async function GET() {
  const [, session] = await getSession();

  const stored = await readRegistration();
  const registration = stored ? toPublicRegistration(stored) : null;
  const preregisteredConfigured = isPreregisteredConfigured();

  if (!session.userInfo) {
    return NextResponse.json({
      authenticated: false,
      preregisteredConfigured,
      registration,
    });
  }

  return NextResponse.json({
    authenticated: true,
    user: session.userInfo,
    mode: session.mode ?? "preregistered",
    preregisteredConfigured,
    registration,
    // Demo convenience: expose the issued tokens so the home page can show them
    // for easy copy. A real app would never return tokens to the browser.
    tokens: session.tokens ?? null,
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
