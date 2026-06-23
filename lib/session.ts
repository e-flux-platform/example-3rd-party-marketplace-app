/**
 * Minimal in-memory session store.
 *
 * This is intentionally simple for a reference implementation. In production
 * you would use a proper session store (e.g. Redis, database-backed, or
 * encrypted cookies).
 *
 * Sessions are keyed by a random ID stored in a cookie.
 */

import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { TokenSet, OAuthMode } from "./oauth";

const SESSION_COOKIE = "session_id";

export interface Session {
  tokens?: TokenSet;
  userInfo?: Record<string, unknown>;
  /** PKCE code verifier, stored between the login redirect and the callback. */
  codeVerifier?: string;
  /** Which client mode this flow/session uses (chosen at login). */
  mode?: OAuthMode;
}

const sessions = new Map<string, Session>();

/**
 * Get or create a session for the current request.
 * Returns [sessionId, session].
 */
export async function getSession(): Promise<[string, Session]> {
  const cookieStore = await cookies();
  const existingId = cookieStore.get(SESSION_COOKIE)?.value;

  if (existingId && sessions.has(existingId)) {
    return [existingId, sessions.get(existingId)!];
  }

  const id = randomBytes(32).toString("hex");
  const session: Session = {};
  sessions.set(id, session);
  return [id, session];
}

/**
 * Remove a session and clear its cookie.
 */
export async function clearSession(sessionId: string): Promise<void> {
  sessions.delete(sessionId);
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Persist session data and set the session cookie.
 */
export async function saveSession(
  sessionId: string,
  session: Session
): Promise<void> {
  sessions.set(sessionId, session);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 1 day
  });
}
