import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/oauth";
import { getSession, saveSession } from "@/lib/session";

/**
 * GET /api/me
 *
 * Proxies GET /1/users/me. This is unrelated to ERE — it exercises a different
 * part of the API surface to confirm the access token's ACL/scoping behaves as
 * expected for the authenticated user.
 */
export async function GET() {
  const [sessionId, session] = await getSession();

  if (!session.tokens) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { accessToken, updatedTokens } = await getValidAccessToken(
    session.tokens,
    session.mode ?? "preregistered"
  );

  if (updatedTokens !== session.tokens) {
    session.tokens = updatedTokens;
    await saveSession(sessionId, session);
  }

  const apiBaseUrl = process.env.ROAD_API_BASE_URL || "https://api.road.io";
  const providerId = process.env.ROAD_PROVIDER_ID;

  const response = await fetch(`${apiBaseUrl}/1/users/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(providerId ? { Provider: providerId } : {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    return NextResponse.json(
      { error: "users/me request failed", status: response.status, body },
      { status: response.status }
    );
  }

  const data = await response.json();
  return NextResponse.json(data);
}
