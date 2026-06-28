import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/oauth";
import { getSession, saveSession } from "@/lib/session";

/**
 * GET /api/account
 *
 * Proxies the Road API account self endpoint, acting as the authenticated user.
 * Requires the `account` scope on the access token. Returns the user's own
 * account; billing/creditBilling fields are present only when the user's RBAC
 * allows (e.g. account admins).
 *
 * @see https://documentation.road.io/reference/getv1accountsself
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

  if (!providerId) {
    return NextResponse.json(
      { error: "ROAD_PROVIDER_ID is not configured" },
      { status: 500 }
    );
  }

  const response = await fetch(`${apiBaseUrl}/1/accounts/self`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      Provider: providerId,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    return NextResponse.json(
      { error: "Account request failed", status: response.status, body },
      { status: response.status }
    );
  }

  const data = await response.json();
  return NextResponse.json(data);
}
