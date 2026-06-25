import { NextRequest, NextResponse } from "next/server";
import {
  getOAuthConfig,
  generatePkce,
  isPreregisteredConfigured,
  OAuthMode,
  AVAILABLE_SCOPES,
} from "@/lib/oauth";
import { getSession, saveSession } from "@/lib/session";

// OIDC `prompt` values this app lets the user pick from the UI (see the
// comment below for what each one does). A single value is supported here;
// the spec also allows a space-delimited combination.
const VALID_PROMPTS = ["none", "consent"] as const;
type Prompt = (typeof VALID_PROMPTS)[number];

/**
 * GET /oauth/login?mode=preregistered|dynamic&prompt=consent
 *
 * Generates a PKCE challenge, stores the verifier + chosen mode in the session,
 * and redirects the user to the e-flux authorization page. The mode and the
 * OIDC `prompt` value are both chosen by the user in the UI (not via the
 * environment).
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

  // The `prompt` param is optional. An explicit empty value ("?prompt=") means
  // "omit the prompt parameter entirely" so the provider applies its default
  // behaviour; a missing param defaults to "consent".
  const rawPrompt = request.nextUrl.searchParams.get("prompt");
  const prompt = rawPrompt === null ? "consent" : rawPrompt;
  if (prompt !== "" && !VALID_PROMPTS.includes(prompt as Prompt)) {
    return NextResponse.json(
      {
        error: `Invalid prompt "${prompt}" (expected one of: ${VALID_PROMPTS.join(
          ", "
        )} or empty to omit)`,
      },
      { status: 400 }
    );
  }

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

  // Scopes to request, chosen in the UI (space-separated). Validated against the
  // known set; `openid` is always included. Falls back to the client's full /
  // registered scope set when nothing is passed. For a preregistered client the
  // selection must be within the installation's registered scopes; for a dynamic
  // client, within what it registered. The provider rejects anything beyond that.
  const rawScope = request.nextUrl.searchParams.get("scope");
  let requestedScope = config.scope;
  if (rawScope) {
    const picked = rawScope
      .split(/\s+/)
      .filter(Boolean)
      .filter((s) => (AVAILABLE_SCOPES as readonly string[]).includes(s));
    const withOpenId = picked.includes("openid") ? picked : ["openid", ...picked];
    if (withOpenId.length > 0) requestedScope = withOpenId.join(" ");
  }

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
   * The value is chosen by the user in the UI before login (defaulting to
   * "consent"), so the different behaviours can be demonstrated. The user can
   * also choose to omit the parameter entirely, leaving the provider's default
   * behaviour in place. Forcing the consent screen on every flow is helpful
   * while developing and demoing this marketplace integration.
   */
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    scope: requestedScope,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  // Only include `prompt` when a value was chosen; an empty selection omits it.
  if (prompt !== "") params.set("prompt", prompt);

  return NextResponse.redirect(`${config.authorizeUrl}?${params.toString()}`);
}
