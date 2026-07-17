import { NextResponse } from "next/server";
import {
  getValidAccessToken,
  headersToObject,
  OAuthRequestError,
  parseResponseBody,
} from "@/lib/oauth";
import { getSession, saveSession } from "@/lib/session";

/** Default records requested per page when the `pageSize` query param is absent. */
const DEFAULT_PAGE_SIZE = 50;
/** Bounds for the caller-supplied `pageSize`. */
const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 1000;
/** Safety cap on the number of pages, to avoid a runaway loop. */
const MAX_PAGES = 1000;

interface EreSessionsResponse {
  data?: unknown[];
  meta?: { total?: number; nextSince?: string };
}

/**
 * GET /api/ere/sessions/all
 *
 * Iterates the Road ERE sessions endpoint using the `meta.nextSince`
 * delta-sync cursor, paging through every session available to the
 * authenticated user (a single GET /1/ere/sessions only returns one page).
 *
 * The cursor is opaque: each response's `meta.nextSince` is passed back
 * verbatim as the next request's `updatedSince` query parameter.
 *
 * Returns the accumulated sessions plus pagination diagnostics:
 *   - pageCount:    how many times the upstream endpoint was called
 *   - fetchedCount: number of session records actually retrieved
 *   - total:        `meta.total` reported by the API (records available)
 *   - capped:       true if MAX_PAGES stopped the loop before exhausting pages
 *
 * Query params:
 *   - pageSize: records requested per page (clamped to [1, 1000]);
 *               defaults to 50. Lower it to verify paging on small datasets.
 *
 * @see https://documentation.road.io/reference/getv1eresessions
 */
export async function GET(request: Request) {
  const requestedPageSize = Number(
    new URL(request.url).searchParams.get("pageSize")
  );
  const pageSize = Number.isFinite(requestedPageSize)
    ? Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, Math.trunc(requestedPageSize)))
    : DEFAULT_PAGE_SIZE;

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
        { status: 401 }
      );
    }
    throw err;
  }

  const apiBaseUrl = process.env.ROAD_API_BASE_URL || "https://api.road.io";
  const providerId = process.env.ROAD_PROVIDER_ID;

  if (!providerId) {
    return NextResponse.json(
      { error: "ROAD_PROVIDER_ID is not configured" },
      { status: 500 }
    );
  }

  const sessions: unknown[] = [];
  let pageCount = 0;
  let total: number | null = null;
  let cursor: string | undefined;
  let capped = false;

  while (true) {
    const url = new URL(`${apiBaseUrl}/1/ere/sessions`);
    url.searchParams.set("limit", String(pageSize));
    if (cursor) url.searchParams.set("updatedSince", cursor);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        Provider: providerId,
      },
    });
    pageCount++;

    if (!response.ok) {
      const body = await parseResponseBody(response);
      return NextResponse.json(
        {
          error: "ERE sessions request failed",
          status: response.status,
          body,
          headers: headersToObject(response.headers),
          pageCount,
        },
        { status: response.status }
      );
    }

    const data = (await response.json()) as EreSessionsResponse;
    const page = Array.isArray(data.data) ? data.data : [];
    sessions.push(...page);

    if (typeof data.meta?.total === "number") {
      total = data.meta.total;
    }

    const nextSince = data.meta?.nextSince;

    // Done when the API stops handing out a cursor, returns an empty page, or
    // the cursor stops advancing (guards against an infinite loop).
    if (!nextSince || page.length === 0 || nextSince === cursor) {
      break;
    }

    cursor = nextSince;

    // More pages exist, but we hit the safety cap.
    if (pageCount >= MAX_PAGES) {
      capped = true;
      break;
    }
  }

  return NextResponse.json({
    pageSize,
    pageCount,
    fetchedCount: sessions.length,
    total,
    capped,
    sessions,
  });
}
