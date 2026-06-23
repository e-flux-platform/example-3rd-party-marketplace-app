import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/oauth";
import { getSession, saveSession } from "@/lib/session";

/**
 * GET /api/ere/sessions
 *
 * Proxies the Road API ERE sessions endpoint.
 * Returns charging session data including energy delivered, timestamps,
 * and location information.
 *
 * @see https://documentation.road.io/reference/getv1eresessions
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

  const apiBaseUrl =
    process.env.ROAD_API_BASE_URL || "https://api.road.io";
  const providerId = process.env.ROAD_PROVIDER_ID;

  if (!providerId) {
    return NextResponse.json(
      { error: "ROAD_PROVIDER_ID is not configured" },
      { status: 500 }
    );
  }

  const response = await fetch(`${apiBaseUrl}/1/ere/sessions?limit=10`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      Provider: providerId,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    return NextResponse.json(
      { error: "ERE sessions request failed", status: response.status, body },
      { status: response.status }
    );
  }

  const data = await response.json();
  return NextResponse.json(data);
}
