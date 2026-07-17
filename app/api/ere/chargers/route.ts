import { NextResponse } from "next/server";
import {
  getValidAccessToken,
  headersToObject,
  OAuthRequestError,
  parseResponseBody,
} from "@/lib/oauth";
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

  let accessToken: string;
  try {
    const result = await getValidAccessToken(session.tokens);
    accessToken = result.accessToken;

    if (result.updatedTokens !== session.tokens) {
      session.tokens = result.updatedTokens;
      await saveSession(sessionId, session);
    }
  } catch (err) {
    if (err instanceof OAuthRequestError) {
      // Surface the token endpoint's actual error response, e.g.
      // invalid_grant when the grant has been revoked server-side.
      return NextResponse.json(
        {
          error: "Token refresh failed",
          status: err.status,
          body: err.body,
          headers: err.headers,
        },
        { status: 401 },
      );
    }
    throw err;
  }

  const apiBaseUrl = process.env.ROAD_API_BASE_URL || "https://api.road.io";
  const providerId = process.env.ROAD_PROVIDER_ID;

  if (!providerId) {
    return NextResponse.json(
      { error: "ROAD_PROVIDER_ID is not configured" },
      { status: 500 },
    );
  }

  const url = `${apiBaseUrl}/1/ere/chargers`;
  console.log(
    `Fetching ERE chargers from ${url} with provider ID ${providerId}`,
  );

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      Provider: providerId,
    },
  });

  if (!response.ok) {
    const body = await parseResponseBody(response);
    return NextResponse.json(
      {
        error: "ERE chargers request failed",
        status: response.status,
        body,
        headers: headersToObject(response.headers),
      },
      { status: response.status },
    );
  }

  const data = await response.json();
  return NextResponse.json(data);
}
