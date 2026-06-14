import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/oauth";
import { getSession, saveSession } from "@/lib/session";

/**
 * GET /api/ere/chargers
 *
 * Proxies the Road API ERE chargers endpoint.
 * Returns charger data including capacity, connector type, model, and
 * renewable energy percentage.
 *
 * @see https://documentation.road.io/reference/getv1erechargers
 */
export async function GET() {
  const [sessionId, session] = await getSession();

  if (!session.tokens) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { accessToken, updatedTokens } = await getValidAccessToken(
    session.tokens
  );

  if (updatedTokens !== session.tokens) {
    session.tokens = updatedTokens;
    await saveSession(sessionId, session);
  }

  const apiBaseUrl =
    process.env.EFLUX_API_BASE_URL || "https://api.road.io";

  const response = await fetch(`${apiBaseUrl}/1/ere/chargers`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    return NextResponse.json(
      { error: "ERE chargers request failed", status: response.status, body },
      { status: response.status }
    );
  }

  const data = await response.json();
  return NextResponse.json(data);
}
