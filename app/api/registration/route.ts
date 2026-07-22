import { NextRequest, NextResponse } from "next/server";
import { AVAILABLE_SCOPES, GATED_SCOPES, OAUTH_SCOPES, isGatedScope } from "@/lib/oauth";
import { getDiscovery } from "@/lib/discovery";
import {
  ensureRegistration,
  fetchManagedClient,
  updateManagedClient,
  deregisterManagedClient,
} from "@/lib/dcr";
import { toPublicRegistration } from "@/lib/registration-store";

const messageOf = (e: unknown): string =>
  e instanceof Error ? e.message : "Unknown error";

function callbackUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base}/oauth/callback`;
}

/** GET /api/registration — RFC 7592 read (does not rotate the token). */
export async function GET() {
  try {
    return NextResponse.json({ client: await fetchManagedClient() });
  } catch (err) {
    return NextResponse.json({ error: messageOf(err) }, { status: 502 });
  }
}

/**
 * POST /api/registration — RFC 7591 register (or reuse the stored one).
 * Body: { scopes?: string[] } — a subset of AVAILABLE_SCOPES. `openid` is
 * always included. Defaults to the full set when omitted.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const scope = resolveScope(body?.scopes);
    if (scope instanceof NextResponse) return scope;

    const discovery = await getDiscovery();
    const registration = await ensureRegistration({
      discovery,
      callbackUrl: callbackUrl(),
      scope,
    });
    return NextResponse.json({ registration: toPublicRegistration(registration) });
  } catch (err) {
    return NextResponse.json({ error: messageOf(err) }, { status: 502 });
  }
}

/** Validate the requested scopes; return a space-delimited string or an error. */
function resolveScope(requested: unknown): string | NextResponse {
  if (requested == null) return OAUTH_SCOPES;
  if (!Array.isArray(requested) || requested.some((s) => typeof s !== "string")) {
    return NextResponse.json(
      { error: "scopes must be an array of strings" },
      { status: 400 }
    );
  }
  const allowed = new Set<string>(AVAILABLE_SCOPES);
  const invalid = (requested as string[]).filter((s) => !allowed.has(s));
  if (invalid.length) {
    return NextResponse.json(
      { error: `Unsupported scope(s): ${invalid.join(", ")}` },
      { status: 400 }
    );
  }
  // Gated scopes are not in the provider's dynamic-registration allowlist —
  // requesting one here would be rejected with `invalid_client_metadata`. Fail
  // early with a clear message: use a preregistered client (a curated template
  // or provider installation) for these.
  const gated = (requested as string[]).filter(isGatedScope);
  if (gated.length) {
    return NextResponse.json(
      {
        error: `Scope(s) not available for dynamic registration: ${gated.join(
          ", "
        )}. These are gated to preregistered clients (${GATED_SCOPES.join(", ")}).`,
      },
      { status: 400 }
    );
  }
  // openid is required for OIDC; dedupe while preserving the canonical order.
  const selected = new Set<string>(requested as string[]);
  selected.add("openid");
  return AVAILABLE_SCOPES.filter((s) => selected.has(s)).join(" ");
}

/** PUT /api/registration — RFC 7592 update (rotates the management token). */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const updated = await updateManagedClient({ client_name: body.client_name });
    return NextResponse.json({ registration: toPublicRegistration(updated) });
  } catch (err) {
    return NextResponse.json({ error: messageOf(err) }, { status: 502 });
  }
}

/** DELETE /api/registration — RFC 7592 deregister (clears the local store). */
export async function DELETE() {
  try {
    await deregisterManagedClient();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: messageOf(err) }, { status: 502 });
  }
}
