import { NextRequest, NextResponse } from "next/server";
import {
  getOAuthConfig,
  generatePkce,
  isPreregisteredConfigured,
  OAuthMode,
} from "@/lib/oauth";
import { getSession, saveSession } from "@/lib/session";

/**
 * GET /oauth/login?mode=preregistered|dynamic
 *
 * Generates a PKCE challenge, stores the verifier + chosen mode in the session,
 * and redirects the user to the e-flux authorization page. The mode is chosen
 * by the user in the UI (not via the environment).
 */
export async function GET(request: NextRequest) {
  const rawMode = request.nextUrl.searchParams.get("mode") || "preregistered";
  if (rawMode !== "preregistered" && rawMode !== "dynamic") {
    return NextResponse.json(
      { error: `Invalid mode "${rawMode}"` },
      { status: 400 }
    );
  }
  const mode = rawMode as OAuthMode;

  if (mode === "preregistered" && !isPreregisteredConfigured()) {
    return NextResponse.json(
      {
        error:
          "Preregistered mode is not configured (set ROAD_OAUTH_CLIENT_ID and ROAD_OAUTH_CLIENT_SECRET).",
      },
      { status: 400 }
    );
  }

  // In dynamic mode this self-registers (or reuses the stored registration).
  const config = await getOAuthConfig(mode);
  const { codeVerifier, codeChallenge } = generatePkce();

  // Store the verifier + mode so the callback can exchange with the right client
  const [sessionId, session] = await getSession();
  session.codeVerifier = codeVerifier;
  session.mode = mode;
  await saveSession(sessionId, session);

  /*
   * The OpenID Connect `prompt` parameter controls how the authorization
   * server interacts with the end user during the authorization request.
   * It is defined in the OIDC core spec (section 3.1.2.1) and accepts a
   * space-delimited list of the following values:
   *
   *   - "none"           Do not display any UI. If the user is not already
   *                      authenticated and consented, the server returns an
   *                      error (login_required / consent_required) instead
   *                      of showing a screen. Useful for silent token refresh.
   *   - "login"          Force the user to re-authenticate, even if they
   *                      already have a valid session with the provider.
   *   - "consent"        Force the consent screen to be shown, even if the
   *                      user has previously consented to the same scopes
   *                      for this client. Without this, providers typically
   *                      remember a prior consent and skip the screen on
   *                      subsequent authorizations.
   *   - "select_account" Prompt the user to pick which account to sign in
   *                      with, when the IdP supports multiple accounts.
   *
   * We pass "consent" here so the user is asked to confirm the requested
   * scopes on every authorization flow, which is helpful while developing
   * and demoing this marketplace integration.
   */
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    scope: config.scope,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "consent",
  });

  return NextResponse.redirect(`${config.authorizeUrl}?${params.toString()}`);
}
