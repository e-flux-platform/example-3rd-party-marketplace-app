import { NextResponse } from "next/server";
import { getSession, clearSession } from "@/lib/session";
import { clearRegistration } from "@/lib/registration-store";
import { deregisterManagedClient } from "@/lib/dcr";

/**
 * DELETE /api/state
 *
 * "Clear all state and start again": best-effort deregister of any dynamic
 * client (RFC 7592), clear the locally stored registration, and clear the
 * user session. Errors from the remote deregister are swallowed so a stale or
 * already-consumed registration can't block the local reset.
 */
export async function DELETE() {
  try {
    await deregisterManagedClient();
  } catch {
    // No registration, or the server rejected it — clear locally regardless.
  }
  await clearRegistration();

  const [sessionId] = await getSession();
  await clearSession(sessionId);

  return NextResponse.json({ ok: true });
}
